"""Regression tests for the audited boundaries; no production calls or data."""
import ast,copy,re,time,json
from datetime import datetime,timedelta,timezone
from psycopg2.extras import RealDictCursor
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock,patch
from urllib.parse import urlparse
import bcrypt,pytest
from flask import request,jsonify,redirect,session
from flask_jwt_extended import JWTManager,create_access_token
from flask_socketio import emit,join_room
from test_precify_v2 import app,client,post,subscription,payment,plan
from precify_core import ApiError,db,digest,new_session,rate_limit
from security_legacy import decode_account_token,token_claims,legacy_user,connect_socket,socket_user,account_ml_token,limit_operation
from security_auth import authenticate_password,validate_registration,PASSWORD_POLICY
from security_network import ml_http,official_resource_url,fetch_product_html,validate_page_url
from seller_analytics import account_snapshots

SOURCE=Path(__file__).parents[1]/'teste.py'
TREE=ast.parse(SOURCE.read_text())
def legacy(app,names,**overrides):
    app.config['JWT_SECRET_KEY']='isolated-regression-only-not-production'
    JWTManager(app)
    app.register_error_handler(ApiError,lambda e:(jsonify(error=e.code),e.status))
    env=dict(globals(),app=app,socketio=app.extensions['precify_realtime'],get_db_connection=app.config['PRECIFY_DB_FACTORY'],decode_token=decode_account_token,
        List=list,Dict=dict,Any=object,url_global='https://example.test',
        MLB8_RE=re.compile(r'\bMLB(\d{8})\b'),MLB10_RE=re.compile(r'\bMLB(\d{10})\b'))
    env.update(overrides)
    definitions=[copy.deepcopy(n) for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in names]
    assert len(definitions)==len(names)
    exec(compile(ast.Module(body=definitions,type_ignores=[]),str(SOURCE),'exec'),env)
    return env

def signed(app,user=None):
    with app.app_context():return create_access_token(identity=str(user or app.test_user),additional_claims=token_claims(user or app.test_user))

def seller(app):
    with app.app_context(),db() as cur:
        cur.execute('INSERT INTO contas_mercado_livre(usuario_id,acess_token,refresh_token,expiracao_token,id_ml) VALUES(%s,%s,%s,%s,%s)',(app.test_user,'fake-own-ml-token','fake-refresh',datetime.now()+timedelta(days=1),12345))

def messages(app):
    with app.app_context(),db() as cur:
        cur.execute('CREATE TABLE mensagens_clientes(usuario_id_mensagem BIGINT,tipo TEXT,cliente_nome TEXT,mensagem TEXT,data_envio TIMESTAMP,autor TEXT,item_id TEXT)')
        cur.execute('CREATE TABLE itens(usuario_id_item BIGINT,item_id TEXT,imagem TEXT[],nome_item TEXT,preco NUMERIC)')
        cur.execute("INSERT INTO usuarios(usuario,email,senha) VALUES('Other','other@example.test','unused') RETURNING id")
        other=cur.fetchone()['id']
        for owner in [app.test_user,other]:
            cur.execute("INSERT INTO mensagens_clientes VALUES(%s,'prevenda','Client',%s,NOW(),'buyer','TEST')",(owner,'private-'+str(owner)))
            cur.execute("INSERT INTO itens VALUES(%s,'TEST',ARRAY['image'],%s,10)",(owner,'item-'+str(owner)))
    return other

def test_private_socket_isolation_and_revoke(app,capsys):
    other=messages(app);legacy(app,['handle_connect','getMensagens'])
    sio=app.extensions['precify_realtime']
    assert not sio.test_client(app).is_connected()
    caller=sio.test_client(app,auth={'token':signed(app)})
    observer=sio.test_client(app,auth={'token':signed(app,other)})
    caller.emit('getMensagens',{'user_id':other,'token':signed(app,other),'tipo':'prevenda'})
    reply=[e for e in caller.get_received() if e['name']=='respostaGetMensagens'][0]
    assert reply['args'][0]['mensagens'][0]['mensagem']=='private-'+str(app.test_user)
    assert observer.get_received()==[]
    assert 'fake-' not in capsys.readouterr().out
    from precify_realtime import disconnect_account
    with app.app_context():disconnect_account(app.test_user)
    assert not caller.is_connected() and observer.is_connected()
    observer.disconnect()

@pytest.mark.parametrize('path,payload',[('/visitsItems',{'itemId':'MLB1234567890'}),('/visitas_por_mes',{'item_id':'MLB1234567890','conversion':1,'price':100}),('/scraping',{'items':[]})])
def test_legacy_reads_require_auth(app,client,path,payload):
    upstream=Mock();legacy(app,['visitsItems','visitas_por_mes','scraping'],ml_http=upstream)
    assert client.post(path,json=payload).status_code==401
    upstream.get.assert_not_called()

@pytest.mark.parametrize('path,payload,response',[('/visitsItems',{'itemId':'MLB1234567890'},{'MLB1234567890':42}),('/visitas_por_mes',{'item_id':'MLB1234567890','conversion':1,'price':100},[{'total_visits':0}])])
def test_legacy_visits_use_only_callers_token(app,client,path,payload,response):
    seller(app);upstream=Mock();upstream.get.return_value.status_code=200;upstream.get.return_value.json.return_value=response
    legacy(app,['visitsItems','visitas_por_mes'],ml_http=upstream)
    assert client.post(path,json=payload,headers={'Authorization':'Bearer '+signed(app)}).status_code==200
    assert all(c.kwargs['headers']['Authorization']=='Bearer fake-own-ml-token' for c in upstream.get.call_args_list)

@pytest.mark.parametrize('value',['.evil.invalid/path','//evil.invalid/path','https://evil.invalid','/items/../../private','/items/MLB12345678?url=x'])
def test_untrusted_notification_destinations_never_get_credentials(value):
    with pytest.raises(ApiError):official_resource_url(value,'items')
    with patch('security_network.http.Session') as session:
        with pytest.raises(ApiError):ml_http.get('https://api.mercadolibre.com'+value,headers={'Authorization':'Bearer fake'}) if value.startswith('.') else ml_http.get('https://evil.invalid',headers={'Authorization':'Bearer fake'})
        session.assert_not_called()

def test_http_keeps_official_origin_without_redirects():
    with patch('security_network.http.Session') as session:
        ml_http.get('https://api.mercadolibre.com/items/MLB12345678',headers={'Authorization':'Bearer fake'},allow_redirects=True)
        call=session.return_value.__enter__.return_value.request.call_args
        assert call.kwargs['allow_redirects'] is False and call.kwargs['timeout']==(3,12)

def test_scraping_rejects_internal_and_rebinding_before_read(app,client):
    read=Mock();legacy(app,['scraping','_resolve_meli_url'],fetch_product_html=read)
    response=client.post('/scraping',headers={'Authorization':'Bearer '+signed(app)},json={'items':[{'item_id':'MLB1234567890','url':'http://127.0.0.1/private'}]})
    assert response.status_code==400;read.assert_not_called()
    with patch('security_network.socket.getaddrinfo',return_value=[(None,None,None,None,('127.0.0.1',443))]),patch('security_network.urllib3.HTTPSConnectionPool') as pool:
        with pytest.raises(ApiError):fetch_product_html('https://www.mercadolivre.com.br/p/MLB12345678')
        pool.assert_not_called()

def test_scraping_pins_ip_checks_redirect_and_limits_body():
    with patch('security_network.socket.getaddrinfo',return_value=[(None,None,None,None,('8.8.8.8',443))]),patch('security_network.urllib3.HTTPSConnectionPool') as pool:
        response=pool.return_value.__enter__.return_value.urlopen.return_value
        # The implementation uses the original pool inside its context.
        response=pool.return_value.urlopen.return_value
        response.status=302;response.headers={'Location':'http://127.0.0.1/private'}
        with pytest.raises(ApiError):fetch_product_html('https://www.mercadolivre.com.br/p/MLB12345678')
        assert pool.call_args.args[0]=='8.8.8.8' and pool.call_args.kwargs['assert_hostname']=='www.mercadolivre.com.br'
        assert pool.call_count==1
        response.status=200;response.read.return_value=b'x'*(2*1024*1024+1)
        with pytest.raises(ApiError):fetch_product_html('https://www.mercadolivre.com.br/p/MLB12345678')

def test_model_cannot_read_other_accounts_or_write_billing(app):
    messages(app)
    with app.app_context():
        result=account_snapshots(app.config['PRECIFY_DB_FACTORY'],['itens'],app.test_user)
        assert [x['nome_item'] for x in result[0]['dados retornados da query']]==['item-'+str(app.test_user)]
        for tables in [['usuarios'],['precify_plans'],['itens; UPDATE precify_plans SET monthly_cents=1']]:
            with pytest.raises(ApiError):account_snapshots(app.config['PRECIFY_DB_FACTORY'],tables,app.test_user)
        with db() as cur:
            cur.execute("SELECT monthly_cents FROM precify_plans WHERE code='pro'");assert cur.fetchone()['monthly_cents']==3490

def test_failure_counter_shared_and_success_does_not_block_others(app,client):
    seller(app);legacy(app,['login_extension','user_login'],gerar_token_extensao=lambda u,**kwargs:'fake-session')
    for _ in range(21):assert post(client,app,'/auth/login',{'email':'test@example.com','password':'test-only-password'}).status_code==200
    for _ in range(20):assert client.post('/login-extension',json={'email':'test@example.com','password':'wrong'}).status_code==401
    assert post(client,app,'/auth/login',{'email':'test@example.com','password':'test-only-password'}).status_code==429
    assert client.post('/user-login',json={'email':'test@example.com','password':'test-only-password'}).status_code==429

def test_legacy_weak_account_must_upgrade_and_accept_terms(app,client):
    legacy(app,['add_usuario'])
    assert client.post('/add-usuario',data={'email':'new@example.test','senha':'x','usuario':'Example'}).status_code==400
    with app.app_context(),db() as cur:
        cur.execute('UPDATE usuarios SET senha=%s,password_policy_version=0 WHERE id=%s',(bcrypt.hashpw(b'x',bcrypt.gensalt(rounds=4)).decode(),app.test_user));cur.execute('DELETE FROM precify_consents')
    response=post(client,app,'/auth/login',{'email':'test@example.com','password':'x'})
    assert response.json['accountRequirements']=={'needsPasswordUpdate':True,'needsTerms':True}
    assert post(client,app,'/imports',{'url':'https://www.mercadolivre.com.br/p/MLB12345678'}).status_code==409
    assert post(client,app,'/auth/complete',{'currentPassword':'x','newPassword':'secure-test-password','acceptedTerms':True,'termsVersion':'2026-10-15'}).status_code==200
    assert client.get('/api/precify/session',headers=app.headers).json['accountRequirements']=={'needsPasswordUpdate':False,'needsTerms':False}
    assert client.get('/api/precify/session',headers={'X-Precify-Session':response.json['sessionToken']}).status_code==401


def test_email_unavailable_and_secure_reset_with_delivery_mock(app,client,monkeypatch):
    monkeypatch.delenv('SMTP_HOST',raising=False)
    assert post(client,app,'/auth/password/request',{'email':'test@example.com'}).status_code==503
    with app.app_context(),db() as cur:
        cur.execute('SELECT count(*) AS n FROM precify_email_actions');assert cur.fetchone()['n']==0
    for k in ('SMTP_HOST','SMTP_USERNAME','SMTP_PASSWORD','SMTP_FROM'):monkeypatch.setenv(k,'test-only')
    with patch('account_email.deliver') as send:
        assert post(client,app,'/auth/password/request',{'email':'test@example.com'}).json=={'ok':True}
        code=send.call_args.args[1]
        assert post(client,app,'/auth/password/request',{'email':'unknown@example.com'}).json=={'ok':True}
        assert send.call_count==1
    with app.app_context(),db() as cur:
        cur.execute('SELECT token_hash FROM precify_email_actions');assert cur.fetchone()['token_hash']==digest(code)
    assert post(client,app,'/auth/password/reset',{'code':code,'password':'changed-password'}).status_code==200
    assert post(client,app,'/auth/password/reset',{'code':code,'password':'changed-again'}).status_code==400
    assert client.get('/api/precify/session',headers=app.headers).status_code==401
    assert post(client,app,'/auth/login',{'email':'test@example.com','password':'changed-password'}).status_code==200


def test_session_list_owner_only_and_revocation(app,client):
    other=messages(app)
    with app.app_context(),db() as cur:second=new_session(cur,app.test_user);foreign=new_session(cur,other)
    response=client.get('/api/precify/auth/sessions',headers=app.headers).json
    assert len(response['sessions'])==2 and foreign not in str(response)
    assert post(client,app,'/auth/sessions/revoke',{'id':digest(foreign)}).status_code==404
    assert post(client,app,'/auth/sessions/revoke',{'id':digest(second)}).status_code==200
    assert client.get('/api/precify/session',headers={'X-Precify-Session':second}).status_code==401


def test_paid_sync_recovers_missing_webhook_and_refund(app,client):
    key,amount=subscription(app);identifier='pre_'+key
    auth={'id':identifier,'external_reference':key,'status':'authorized','last_modified':datetime.now().isoformat()+'Z','auto_recurring':{'transaction_amount':amount/100,'currency_id':'BRL','frequency':1,'frequency_type':'months'}}
    pay=payment(key,amount)
    def provider(method,path,*args,**kwargs):
        if path=='/preapproval/'+identifier:return auth
        if path.startswith('/authorized_payments/search?'):return {'results':[{'id':77}], 'paging':{'total':1}}
        if path=='/authorized_payments/77':return {'id':77,'preapproval_id':identifier,'payment':{'id':123}}
        if path=='/v1/payments/123':return pay
        raise AssertionError(path)
    with patch('precify_billing.mp',side_effect=provider):
        assert post(client,app,'/billing/sync').status_code==200
        assert plan(app)['tier']=='pro'
        assert post(client,app,'/billing/sync').status_code==200
        with app.app_context(),db() as cur:cur.execute('SELECT count(*) AS n FROM precify_payments');assert cur.fetchone()['n']==1
        pay.update(status='refunded',date_last_updated=datetime.now(timezone.utc).isoformat())
        assert post(client,app,'/billing/sync').status_code==200
        assert plan(app)['tier']=='free'


def test_notifications_verify_owner_before_dispatch_and_accept_official_formats(app,client):
    seller(app);worker=Mock();sio=SimpleNamespace(start_background_task=Mock())
    legacy(app,['webhook_mercado_livre_messages'],socketio=sio,processar_notificacao_ml=worker)
    payload={'user_id':12345,'topic':'public_offers','resource':'.evil.invalid/path'}
    with patch('security_notifications.ml_http.get') as upstream:
        assert client.post('/webhook/ml/messages',json=payload).status_code==400
        upstream.assert_not_called()
        assert client.post('/webhook/ml/messages',json={**payload,'topic':None,'resource':'/users/me'}).status_code==400
        upstream.assert_not_called()
        payload.update(topic='items',resource='/items/MLB1234567890')
        upstream.return_value.status_code=200;upstream.return_value.json.return_value={'seller_id':999}
        assert client.post('/webhook/ml/messages',json=payload).status_code==202
        sio.start_background_task.assert_not_called()
        upstream.return_value.json.return_value={'seller_id':12345}
        assert client.post('/webhook/ml/messages',json=payload).status_code==200
        assert sio.start_background_task.call_count==1
        assert client.post('/webhook/ml/messages',json=payload).json['status']=='duplicate'
        assert sio.start_background_task.call_count==1
    from security_notifications import owned_resource
    assert official_resource_url('a35cf79864a845ca9a3bf6aee59bb4d7','messages').endswith('/messages/a35cf79864a845ca9a3bf6aee59bb4d7')
    assert official_resource_url('post-purchase/v1/claims/1234','post_purchase').endswith('/post-purchase/v1/claims/1234')
    assert owned_resource({'messages':[{'from':{'user_id':42},'to':{'user_id':12345}}]},'messages',12345)
    assert not owned_resource({'seller_id':42,'from':{'id':12345}},'questions',12345)


def test_email_verification_expiry_ownership_and_single_use(app,client,monkeypatch):
    other=messages(app)
    with app.app_context(),db() as cur: foreign=new_session(cur,other)
    for k in ('SMTP_HOST','SMTP_USERNAME','SMTP_PASSWORD','SMTP_FROM'):monkeypatch.setenv(k,'test-only')
    with patch('account_email.deliver') as send:
        assert post(client,app,'/auth/email/request').status_code==200
        code=send.call_args.args[1]
    assert client.post('/api/precify/auth/email/confirm',json={'code':code},headers={'X-Precify-Session':foreign}).status_code==400
    assert post(client,app,'/auth/email/confirm',{'code':code}).status_code==200
    assert post(client,app,'/auth/email/confirm',{'code':code}).status_code==400
    assert client.get('/api/precify/session',headers=app.headers).json['emailVerified'] is True
    with patch('account_email.deliver') as send:
        post(client,app,'/auth/password/request',{'email':'test@example.com'});code=send.call_args.args[1]
    with app.app_context(),db() as cur:cur.execute("UPDATE precify_email_actions SET expires_at=NOW()-INTERVAL '1 second'")
    assert post(client,app,'/auth/password/reset',{'code':code,'password':'secure-password'}).status_code==400


def test_password_change_revokes_existing_legacy_jwt(app,client):
    legacy(app,['visitsItems']);jwt=signed(app)
    assert post(client,app,'/auth/complete',{'currentPassword':'test-only-password','newPassword':'changed-password'}).status_code==200
    assert client.post('/visitsItems',json={'itemId':'MLB1234567890'},headers={'Authorization':'Bearer '+jwt}).status_code==401


def test_reconciler_persists_failure_for_retry_and_does_not_duplicate_claim(app,monkeypatch):
    from billing_reconciliation import run_once
    subscription(app)
    monkeypatch.setenv('MERCADO_PAGO_ACCESS_TOKEN','test-only');monkeypatch.setenv('MERCADO_PAGO_WEBHOOK_SECRET','test-only')
    with app.app_context(),patch('billing_reconciliation.reconcile_subscription',side_effect=ApiError('payment_provider_unavailable',502)) as sync:
        run_once();run_once();assert sync.call_count==1
        with db() as cur:
            cur.execute('SELECT reconcile_error,reconciled_at,reconcile_after>NOW() AS later FROM precify_subscriptions');row=cur.fetchone()
            assert row['reconcile_error']=='payment_provider_unavailable' and row['reconciled_at'] is None and row['later']


def test_reconcile_rejects_foreign_invoice(app,client):
    key,amount=subscription(app);identifier='pre_'+key
    authorization={'id':identifier,'external_reference':key,'status':'authorized','last_modified':datetime.now(timezone.utc).isoformat(),'auto_recurring':{'transaction_amount':amount/100,'currency_id':'BRL','frequency':1,'frequency_type':'months'}}
    with patch('precify_billing.mp',side_effect=[authorization,{'results':[{'id':77}],'paging':{'total':1}},{'id':77,'preapproval_id':'other-account','payment':{'id':123}}]) as upstream:
        assert post(client,app,'/billing/sync').status_code==502
        assert upstream.call_count==3 and plan(app)['tier']=='free'


def test_login_cannot_issue_a_session_after_password_reset_race(app,client):
    with app.test_request_context('/'),app.app_context():
        stale=authenticate_password('test@example.com','test-only-password')
        with db() as cur: cur.execute('UPDATE usuarios SET auth_version=auth_version+1')
    with patch('precify_api.authenticate_password',return_value=stale):
        assert post(client,app,'/auth/login',{'email':'test@example.com','password':'test-only-password'}).status_code==401


def test_extension_refresh_preserves_valid_auth_epoch(app,client):
    seller(app)
    renewal=Mock(return_value={'access_token':'new-fake-access','novo_refresh_token':'new-fake-refresh','nova_expiracao':datetime.now()+timedelta(days=1)})
    legacy(app,['token_access','gerar_token_extensao'],renovar_access_token=renewal)
    response=client.post('/token_access',json={'refresh_token':'fake-refresh','token_user':signed(app)})
    assert response.status_code==200 and response.json['access_token']=='new-fake-access'
    with app.app_context():assert decode_account_token(response.json['token_user'])['auth_version']==0
    renewal.assert_called_once_with('fake-refresh')
