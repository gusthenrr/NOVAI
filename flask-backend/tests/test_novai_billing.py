"""Website billing: isolated PostgreSQL and mocked Mercado Pago only."""
from datetime import datetime,timedelta,timezone
from unittest.mock import patch
import pytest
from flask_jwt_extended import JWTManager,create_access_token
from test_precify_v2 import app,client,DSN,post,plan,subscription,payment
from precify_core import db
from precify_billing import record_subscription,record_payment
from novai_plans import NOVAI_BILLING_TERMS_VERSION
pytestmark=pytest.mark.skipif(not DSN,reason='Isolated PostgreSQL required')
ORIGIN='https://novai-site.example'

@pytest.fixture
def web(app,monkeypatch):
    monkeypatch.setenv('FRONTEND_URL',ORIGIN)
    monkeypatch.setenv('MERCADO_PAGO_ACCESS_TOKEN','test-only-provider')
    monkeypatch.setenv('MERCADO_PAGO_WEBHOOK_SECRET','test-only-webhook')
    app.config['JWT_SECRET_KEY']='isolated-web-token-only-never-production-48chars'
    JWTManager(app)
    with app.app_context(): token=create_access_token(identity=str(app.test_user),additional_claims={'auth_version':0})
    return {'Authorization':'Bearer '+token,'Origin':ORIGIN}

def pick(tier='pro',cycle='monthly',trial=True):
    amount={'pro':{'monthly':5799,'annual':67188},'max':{'monthly':7999,'annual':91188}}[tier][cycle]
    return dict(acceptedBillingTerms=True,tier=tier,cycle=cycle,trial=trial,expectedAmountCents=amount,billingTermsVersion=NOVAI_BILLING_TERMS_VERSION)

def checkout(client,headers,**kwargs):
    return client.post('/api/novai/billing/checkout',headers=headers,json=pick(**kwargs))

def provider(method,path,payload=None,key=None):
    if method=='POST':
        return dict(id='mp_'+str(key),status='active' if path=='/preapproval_plan' else 'pending',auto_recurring=payload['auto_recurring'],init_point='https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id='+str(key))
    if method=='PUT': return {'status':'cancelled'}
    if path.startswith('/preapproval/search?'): return {'results':[]}
    raise AssertionError((method,path))

def authorized(sub):
    instant=datetime.now(timezone.utc)
    return dict(id='authorized_'+str(sub['id']),preapproval_plan_id=sub['provider_plan_id'],status='authorized',auto_recurring=dict(currency_id='BRL',transaction_amount=sub['amount_cents']/100,frequency=1 if sub['cycle']=='monthly' else 12,frequency_type='months',free_trial=dict(frequency=7,frequency_type='days')),date_created=instant.isoformat(),last_modified=instant.isoformat(),next_payment_date=(instant+timedelta(days=7)).isoformat())

def saved_subscription(app):
    with app.app_context(),db() as cur:
        cur.execute("SELECT * FROM precify_subscriptions WHERE user_id=%s AND product_code='novai'",(app.test_user,))
        return cur.fetchone()

def test_catalog_preserves_confirmed_prices_and_native_catalog(app,client,web):
    data=client.get('/api/novai/billing/plans',headers={'Origin':ORIGIN}).json
    assert data['paymentsEnabled'] is True
    assert [(p['code'],p['monthly_cents'],p['annual_cents'],p['trial_days']) for p in data['plans']]==[('pro',5799,67188,7),('max',7999,91188,7)]
    native=client.get('/api/precify/billing/plans').json
    assert [p['code'] for p in native['plans']]==['free','plus','pro']
    assert native['plans'][-1]['monthly_cents']==3490

def test_bearer_origin_consent_and_quote_required(app,client,web):
    with patch('precify_billing.mp') as mp:
        assert checkout(client,{'Origin':ORIGIN}).status_code==401
        assert checkout(client,dict(web,Origin='https://evil.example')).status_code==403
        for change in [{'expectedAmountCents':1},{'expectedAmountCents':True},{'billingTermsVersion':'stale'}]:
            assert client.post('/api/novai/billing/checkout',headers=web,json=dict(pick(),**change)).status_code in (400,409)
        assert not mp.called

@pytest.mark.parametrize('tier,cycle',[('pro','monthly'),('max','annual')])
def test_checkout_idempotent_and_account_bound_no_early_access(app,client,web,tier,cycle):
    with patch('precify_billing.mp',side_effect=provider) as mp:
        first=checkout(client,web,tier=tier,cycle=cycle);second=checkout(client,web,tier=tier,cycle=cycle)
    assert first.status_code==200 and first.json==second.json
    assert mp.call_count==1
    payload=mp.call_args.args[2]
    assert payload['reason'].startswith('NOVAI '+tier.title())
    assert payload['auto_recurring']['transaction_amount']==pick(tier,cycle)['expectedAmountCents']/100
    assert payload['auto_recurring']['free_trial']=={'frequency':7,'frequency_type':'days'}
    assert payload['back_url'].endswith('/api/novai/billing/return')
    sub=saved_subscription(app)
    assert sub['novai_plan_code']==tier and sub['product_code']=='novai'
    assert sub['billing_consent_version']==NOVAI_BILLING_TERMS_VERSION
    assert client.get('/api/novai/billing/account',headers=web).json['plan']['tier']=='free'
    assert client.get('/api/novai/billing/return?status=approved').status_code==303
    assert plan(app)['tier']=='free'

@pytest.mark.parametrize('tier,expected',[('pro','free'),('max','pro')])
def test_verified_authorization_starts_correct_trial_and_max_bundle(app,client,web,tier,expected):
    with patch('precify_billing.mp',side_effect=provider):
        assert checkout(client,web,tier=tier).status_code==200
        result=authorized(saved_subscription(app))
        with app.app_context():record_subscription(result['id'],result)
    state=client.get('/api/novai/billing/account',headers=web).json
    assert state['plan']['tier']==tier and state['plan']['status']=='trialing'
    assert state['plan']['features']['precifyPro']==(tier=='max')
    assert plan(app)['tier']==expected
    with app.app_context(),db() as cur:
        cur.execute('SELECT trial_started_at FROM precify_accounts WHERE user_id=%s',(app.test_user,))
        assert cur.fetchone()['trial_started_at'] is None
    assert checkout(client,web,tier=tier).json['error']=='trial_already_used'

@pytest.mark.parametrize('tier,expected',[('pro','free'),('max','pro')])
def test_verified_payments_and_refunds_update_correct_product(app,client,web,tier,expected):
    with patch('precify_billing.mp',side_effect=provider):assert checkout(client,web,tier=tier,trial=False).status_code==200
    sub=saved_subscription(app);current=payment(str(sub['id']),sub['amount_cents'])
    with app.app_context():record_payment(current)
    assert client.get('/api/novai/billing/account',headers=web).json['plan']['tier']==tier
    assert plan(app)['tier']==expected
    current.update(status='refunded',date_last_updated=(datetime.now(timezone.utc)+timedelta(seconds=1)).isoformat())
    with app.app_context():record_payment(current)
    assert client.get('/api/novai/billing/account',headers=web).json['plan']['tier']=='free'
    assert plan(app)['tier']=='free'

def test_native_plan_does_not_grant_novai_and_bundle_prevents_double_billing(app,client,web):
    key,amount=subscription(app)
    with app.app_context():record_payment(payment(key,amount))
    assert client.get('/api/novai/billing/account',headers=web).json['plan']['tier']=='free'
    with patch('precify_billing.mp') as mp:
        response=checkout(client,web,tier='max')
        assert response.status_code==409 and response.json['error']=='bundle_subscription_conflict'
        assert not mp.called

def test_product_boundaries_for_history_and_cancellation(app,client,web):
    key,_=subscription(app)
    with patch('precify_billing.mp',side_effect=provider):
        assert checkout(client,web).status_code==200
        own=saved_subscription(app)
        rows=client.get('/api/novai/billing/account',headers=web).json['subscriptions']
        assert len(rows)==1 and rows[0]['tier']=='pro'
        assert client.get('/api/precify/billing/history',headers=app.headers).json['subscriptions'][0]['id']==key
        assert client.post('/api/novai/billing/cancel',headers=web,json={'subscriptionId':key}).status_code==404
        assert post(client,app,'/billing/cancel',{'subscriptionId':str(own['id'])}).status_code==404
        assert client.post('/api/novai/billing/cancel',headers=web,json={'subscriptionId':str(own['id'])}).status_code==200
    assert client.get('/api/novai/billing/account',headers=web).json['subscriptions'][0]['status']=='cancelled'

def test_pending_max_blocks_a_second_precify_subscription(app,client,web):
    with patch('precify_billing.mp',side_effect=provider):assert checkout(client,web,tier='max').status_code==200
    with patch('precify_billing.mp') as mp:
        response=post(client,app,'/billing/checkout',{'tier':'pro','cycle':'monthly'})
        assert response.status_code==409 and response.json['error']=='bundle_subscription_conflict'
        assert not mp.called

def test_replayed_wrong_amount_and_revoked_site_token_cannot_grant_access(app,client,web):
    with patch('precify_billing.mp',side_effect=provider):assert checkout(client,web,tier='max').status_code==200
    result=authorized(saved_subscription(app));result['auto_recurring']['transaction_amount']=1
    from precify_core import ApiError
    with app.app_context(),pytest.raises(ApiError):record_subscription(result['id'],result)
    assert plan(app)['tier']=='free'
    with app.app_context(),db() as cur:cur.execute('UPDATE usuarios SET auth_version=auth_version+1 WHERE id=%s',(app.test_user,))
    assert client.get('/api/novai/billing/account',headers=web).status_code==401


def test_railway_scheme_less_frontend_and_invalid_configuration(app,client,web,monkeypatch):
    monkeypatch.setenv('FRONTEND_URL','novai-site.example')
    response=client.get('/api/novai/billing/plans',headers={'Origin':ORIGIN})
    assert response.status_code==200 and response.headers['Access-Control-Allow-Origin']==ORIGIN
    preflight=client.options('/api/novai/billing/checkout',headers={'Origin':ORIGIN,'Access-Control-Request-Method':'POST'})
    assert preflight.status_code==204
    monkeypatch.setenv('FRONTEND_URL','http://insecure.example')
    response=checkout(client,web)
    assert response.status_code==503 and response.json['error']=='site_not_configured'
