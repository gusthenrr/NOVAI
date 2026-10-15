"""Integration tests use an explicit, isolated PostgreSQL test database only.
Run: PRECIFY_TEST_DATABASE_URL=... pytest tests/test_precify_v2.py
"""
import hashlib
import hmac
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
import pytest
from flask import Flask

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from precify_api import register_precify, oauth_callback
from precify_core import ApiError, db, digest, month_window, new_session, plan_for, reserve_import
from precify_billing import record_payment, verify_signature

DSN=os.environ.get('PRECIFY_TEST_DATABASE_URL')
pytestmark=pytest.mark.skipif(not DSN,reason='Set an isolated PRECIFY_TEST_DATABASE_URL; production DATABASE_URL is never used')
ROOT=Path(__file__).resolve().parents[2]

@pytest.fixture
def app():
    schema='test_precify_'+uuid4().hex
    with psycopg2.connect(DSN) as conn:
        with conn.cursor() as cur:
            cur.execute('CREATE SCHEMA '+schema)
    def connect():
        return psycopg2.connect(DSN,options='-c search_path='+schema,cursor_factory=RealDictCursor)
    app=Flask(__name__);app.config.update(TESTING=True,PRECIFY_DB_FACTORY=connect)
    register_precify(app);app.add_url_rule('/callback','callback',oauth_callback)
    with app.app_context():
        with db() as cur:
            for _ in range(2): # Migration is safe on repeat deploys.
                cur.execute((ROOT/'database/init_token_only.sql').read_text())
                cur.execute((ROOT/'database/precify_v2.sql').read_text())
            cur.execute('INSERT INTO usuarios(usuario,email,senha) VALUES(%s,%s,%s) RETURNING id',('Teste','test@example.com',bcrypt.hashpw(b'test-only-password',bcrypt.gensalt(rounds=4)).decode()))
            user=cur.fetchone()['id']; token=new_session(cur,user)
    app.test_user=user;app.test_token=token;app.headers={'X-Precify-Session':token}
    yield app
    with psycopg2.connect(DSN) as conn:
        with conn.cursor() as cur:cur.execute('DROP SCHEMA '+schema+' CASCADE')

@pytest.fixture
def client(app):return app.test_client()

def post(client,app,path,data=None):return client.post('/api/precify'+path,headers=app.headers,json=data or {})
def plan(app):
    with app.app_context(),db() as cur:return plan_for(cur,app.test_user)

def subscription(app,tier='pro',cycle='monthly'):
    key=str(uuid4()); amount=(3490 if tier=='pro' else 3190) if cycle=='monthly' else (29990 if tier=='pro' else 27990)
    with app.app_context(),db() as cur:
        cur.execute('INSERT INTO precify_subscriptions(id,user_id,plan_code,cycle,amount_cents,provider_id) VALUES(%s,%s,%s,%s,%s,%s)',(key,app.test_user,tier,cycle,amount,'pre_'+key))
    return key,amount

def payment(key,amount,**changes):
    instant=datetime.now(timezone.utc).isoformat()
    return dict(id=123,external_reference=key,transaction_amount=amount/100,currency_id='BRL',status='approved',date_last_updated=instant,date_approved=instant,**changes)

def test_login_restore_revocation_and_no_ml_credentials(app,client):
    denied=post(client,app,'/auth/login',{'email':'test@example.com','password':'wrong'})
    assert denied.status_code==401
    response=post(client,app,'/auth/login',{'email':'TEST@example.com','password':'test-only-password'})
    assert response.status_code==200
    data=response.json;token=data.pop('sessionToken')
    assert data['plan']['usage']['limit']==10 and data['linked'] is False
    assert 'access_token' not in str(data) and 'senha' not in str(data)
    with app.app_context(),db() as cur:
        cur.execute('SELECT token_hash FROM precify_sessions WHERE token_hash=%s',(digest(token),));assert cur.fetchone()
        cur.execute('SELECT token_hash FROM precify_sessions WHERE token_hash=%s',(token,));assert cur.fetchone() is None
    headers={'X-Precify-Session':token}
    assert client.get('/api/precify/session',headers=headers).status_code==200
    assert client.post('/api/precify/auth/logout',headers=headers).status_code==200
    assert client.get('/api/precify/session',headers=headers).status_code==401

def test_registration_consent_and_existing_novai_account(app,client):
    data=dict(email='new@example.com',name='Nova Conta',password='strong-test-password',acceptedTerms=False,termsVersion='2026-10-15')
    assert post(client,app,'/auth/register',data).json['error']=='terms_required'
    data['acceptedTerms']=True
    response=post(client,app,'/auth/register',data);assert response.status_code==201
    with app.app_context(),db() as cur:
        cur.execute('SELECT senha FROM usuarios WHERE email=%s',(data['email'],));assert bcrypt.checkpw(data['password'].encode(),cur.fetchone()['senha'].encode())
        cur.execute('SELECT version FROM precify_consents');assert cur.fetchone()['version']=='2026-10-15'
    assert post(client,app,'/auth/register',data).status_code==409

def test_quota_idempotency_and_permit_binding(app,client):
    url='https://www.mercadolivre.com.br/p/MLB68084564';key=str(uuid4())
    first=post(client,app,'/imports',dict(url=url,requestKey=key));assert first.status_code==200
    assert post(client,app,'/imports',dict(url=url,requestKey=key)).json==first.json
    assert post(client,app,'/imports',dict(url=url+'?other=1',requestKey=key)).status_code==409
    permit=first.json['importId']
    assert post(client,app,'/imports/validate',dict(importId=permit,url=url)).json=={'ok':True,'insights':False}
    assert post(client,app,'/imports/validate',dict(importId=permit,url=url+'?changed=1')).status_code==403
    for _ in range(9):assert post(client,app,'/imports',dict(url=url,requestKey=str(uuid4()))).status_code==200
    assert post(client,app,'/imports',dict(url=url,requestKey=str(uuid4()))).status_code==429
    assert plan(app)['usage']['used']==10
    # An already-authorized request can be retried after hitting the allowance.
    assert post(client,app,'/imports',dict(url=url,requestKey=key)).status_code==200

def test_quota_concurrency_never_exceeds_ten(app):
    def attempt(_):
        with app.app_context():
            try:reserve_import(app.test_user,str(uuid4()),'https://www.mercadolivre.com.br/p/MLB68084564');return 200
            except ApiError as e:return e.status
    with ThreadPoolExecutor(max_workers=12) as pool:statuses=list(pool.map(attempt,range(16)))
    assert statuses.count(200)==10 and statuses.count(429)==6
    assert plan(app)['usage']['used']==10

def test_brasilia_month_boundary():
    start,end=month_window(datetime(2026,11,1,2,59,tzinfo=timezone.utc))
    assert str(start)=='2026-10-01' and end=='2026-11-01T00:00:00-03:00'
    assert str(month_window(datetime(2026,11,1,3,0,tzinfo=timezone.utc))[0])=='2026-11-01'

def test_free_protected_data_never_queries_ml(app,client):
    with patch('precify_api.ml_token') as token,patch('precify_api.get_ml') as upstream:
        assert client.get('/api/precify/items/MLB6203834422/insights',headers=app.headers).status_code==403
        assert post(client,app,'/pricing',dict(comparison=True)).status_code==403
        assert post(client,app,'/comparison',dict(marketplace='shopee')).status_code==403
        token.assert_not_called();upstream.assert_not_called()

def test_trial_once_expiry_and_pro_only_insights(app,client):
    assert post(client,app,'/trial').json['plan']['tier']=='pro'
    assert post(client,app,'/trial').status_code==409
    with patch('precify_api.ml_token',return_value='test-token'),patch('precify_api.get_ml',side_effect=[{'id':'MLB6203834422','sold_quantity':13},{'date_created':'2026-01-27T23:33:16.887Z'}]) as get:
        response=client.get('/api/precify/items/MLB6203834422/insights',headers=app.headers)
        assert response.status_code==200 and response.json['sold']==13
        assert response.json['createdAt']==dict(iso='2026-01-27T23:33:16.887Z',source='ml_description')
        assert get.call_args.args[0]=='/items/MLB6203834422/description'
    with app.app_context(),db() as cur:cur.execute("UPDATE precify_accounts SET trial_ends_at=NOW()-INTERVAL '1 second'")
    assert plan(app)['tier']=='free' and not plan(app)['trialAvailable']

def test_oauth_ticket_state_one_use_pkce_no_credentials_in_redirect(app,client,monkeypatch):
    monkeypatch.setenv('MERCADO_LIVRE_CLIENT_ID','test-client')
    monkeypatch.setenv('MERCADO_LIVRE_REDIRECT_URI','https://novai-production-0d2f.up.railway.app/callback')
    url=post(client,app,'/auth/connect').json['url'];path=urlsplit(url)
    route=path.path+'?'+path.query
    started=client.get(route);assert started.status_code==302
    query=parse_qs(urlsplit(started.location).query)
    assert query['code_challenge_method']==['S256'] and len(query['code_challenge'][0])==43
    assert 'access_token' not in started.location
    assert client.get(route).status_code==400
    class Response:
        ok=True
        def json(self):return dict(access_token='test-ml-token',refresh_token='test-refresh',expires_in=21600,user_id=12)
    with patch('precify_api.requests.post',return_value=Response()) as exchange:
        callback='/callback?state='+query['state'][0]+'&code=test-code'
        response=client.get(callback);assert response.status_code==200
        assert b'test-ml-token' not in response.data
        assert client.get(callback).status_code==400
        assert exchange.call_count==1 and exchange.call_args.args[0]=='https://api.mercadolibre.com/oauth/token'
    assert client.get('/api/precify/session',headers=app.headers).json['linked'] is True

def test_plans_prices_and_checkout_requires_config(app,client,monkeypatch):
    monkeypatch.delenv('MERCADO_PAGO_ACCESS_TOKEN',raising=False)
    result=client.get('/api/precify/billing/plans').json
    assert not result['paymentsEnabled']
    assert [(p['monthly_cents'],p['annual_cents']) for p in result['plans']]==[(0,0),(3190,27990),(3490,29990)]
    assert post(client,app,'/billing/checkout',dict(tier='pro',cycle='annual')).status_code==503
    assert client.get('/api/precify/billing/return?status=approved').status_code==200
    assert plan(app)['tier']=='free'

def test_checkout_price_server_owned_pending_never_grants_access(app,client,monkeypatch):
    monkeypatch.setenv('MERCADO_PAGO_ACCESS_TOKEN','test-provider-token');monkeypatch.setenv('MERCADO_PAGO_WEBHOOK_SECRET','test-secret')
    with patch('precify_billing.mp',return_value=dict(id='test-preapproval',init_point='https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=test')) as provider:
        result=post(client,app,'/billing/checkout',dict(tier='pro',cycle='annual',amount=0.01,userId=999))
        assert result.status_code==200
        sent=provider.call_args.args[2];assert sent['auto_recurring']['transaction_amount']==299.9
        assert sent['auto_recurring']['frequency']==12 and sent['status']=='pending'
        assert post(client,app,'/billing/checkout',dict(tier='pro',cycle='annual')).json==result.json
        assert provider.call_count==1
    assert plan(app)['tier']=='free'

def test_approved_payment_duplicate_refund_and_old_notification(app):
    key,amount=subscription(app);data=payment(key,amount)
    with app.app_context():record_payment(data);record_payment(data)
    assert plan(app)['tier']=='pro'
    with app.app_context(),db() as cur:
        cur.execute('SELECT COUNT(*) AS n FROM precify_payments');assert cur.fetchone()['n']==1
    refund={**data,'status':'refunded','date_last_updated':(datetime.now(timezone.utc)+timedelta(seconds=1)).isoformat()}
    with app.app_context():record_payment(refund);record_payment(data)
    assert plan(app)['tier']=='free'

@pytest.mark.parametrize('changes',[{'transaction_amount':0.01},{'currency_id':'USD'},{'date_approved':None},{'external_reference':'wrong'}])
def test_payment_cannot_lie_about_amount_currency_or_account(app,changes):
    key,amount=subscription(app);data={**payment(key,amount),**changes}
    with app.app_context():
        if changes.get('external_reference'):
            record_payment(data) # Unrelated transaction ignored.
        else:
            with pytest.raises(ApiError):record_payment(data)
    assert plan(app)['tier']=='free'

def test_cancellation_preserves_paid_period_and_is_owned(app,client):
    key,amount=subscription(app)
    with app.app_context():record_payment(payment(key,amount))
    assert post(client,app,'/billing/cancel',{'subscriptionId':str(uuid4())}).status_code==404
    with patch('precify_billing.mp',return_value={'status':'cancelled'}):
        assert post(client,app,'/billing/cancel',{'subscriptionId':key}).status_code==200
    assert plan(app)['tier']=='pro'

def test_signed_webhook_fetches_provider_data_and_rejects_tampering(app,client,monkeypatch):
    secret='test-webhook-secret';monkeypatch.setenv('MERCADO_PAGO_WEBHOOK_SECRET',secret)
    key,amount=subscription(app)
    timestamp=str(int(time.time()));request_id='test-request';resource='123'
    signature=hmac.new(secret.encode(),f'id:{resource};request-id:{request_id};ts:{timestamp};'.encode(),hashlib.sha256).hexdigest()
    headers={'x-request-id':request_id,'x-signature':f'ts={timestamp},v1={signature}'}
    with patch('precify_billing.mp',return_value=payment(key,amount)) as provider:
        url='/api/precify/billing/webhook?data.id=123'
        assert client.post(url,headers={},json={'type':'payment','data':{'id':123}}).status_code==401
        assert client.post(url,headers=headers,json={'type':'payment','data':[]}).status_code==400
        provider.assert_not_called()
        assert client.post(url,headers=headers,json={'type':'payment','data':{'id':123},'amount':0.01}).status_code==200
        provider.assert_called_once_with('GET','/v1/payments/123')
    assert plan(app)['tier']=='pro'
    assert not verify_signature(headers['x-signature'],request_id,resource,secret,at=time.time()+601)

def test_invalid_urls_are_rejected_before_quota(app,client):
    for url in ['http://localhost/','https://mercadolivre.com.br:bad/test','https://mercadolivre.com.br.evil.invalid/','https://[invalid']:
        assert post(client,app,'/imports',dict(url=url,requestKey=str(uuid4()))).status_code==400
    assert plan(app)['usage']['used']==0

def test_pricing_uses_server_ml_token_and_preserves_calculator_validation(app,client):
    with patch('precify_api.ml_token',return_value='server-only-ml-token'),patch('pricing_margin.margin') as handler:
        from flask import request,jsonify
        def quote():
            assert request.headers['Authorization']=='Bearer server-only-ml-token'
            assert request.get_json()['precoVenda']==100
            return jsonify(frete=8,tarifas=14,impostos=4,custos=40,margemContribuicao=34,margemPct=34,missing=[])
        handler.side_effect=quote
        response=post(client,app,'/pricing',dict(precoVenda=100,access_token='ignored-client-token'))
        assert response.status_code==200 and response.json['frete']==8
        assert b'server-only' not in response.data
