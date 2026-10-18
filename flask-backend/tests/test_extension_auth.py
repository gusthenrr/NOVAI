"""Real isolated PostgreSQL; never uses production credentials or accounts."""
import os
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.parse import parse_qs,urlsplit
from datetime import timedelta
import pytest
from test_precify_v2 import app as base_app
from precify_core import db,now
from extension_api import extension,ACCESS,REFRESH,CSRF,EXTENSION_ID,oauth_callback

pytestmark=pytest.mark.skipif(not os.environ.get('PRECIFY_TEST_DATABASE_URL'),reason='Isolated PostgreSQL required')
BASE='https://novai.test'
ORIGIN='chrome-extension://'+EXTENSION_ID

@pytest.fixture
def app(base_app,monkeypatch):
    monkeypatch.setenv('PUBLIC_BASE_URL',BASE)
    monkeypatch.setenv('MERCADO_LIVRE_CLIENT_ID','test-client')
    monkeypatch.setenv('MERCADO_LIVRE_CLIENT_SECRET','test-secret')
    base_app.config['JWT_SECRET_KEY']='test-only-signing-secret-with-more-than-32-bytes'
    base_app.register_blueprint(extension)
    base_app.add_url_rule('/extension-callback',view_func=oauth_callback)
    with base_app.app_context(),db() as cur:
        schema=(Path(__file__).parents[2]/'database/extension_sessions.sql').read_text()
        cur.execute(schema);cur.execute(schema)
    return base_app

@pytest.fixture
def client(app):return app.test_client()

def post(client,path,data=None,origin=ORIGIN):
    csrf=client.get('/api/extension/csrf',base_url=BASE,headers={'Origin':origin})
    return client.post('/api/extension/'+path,base_url=BASE,json=data or {},headers={'Origin':origin,'X-CSRF-Token':csrf.json.get('csrf','')})

def login(client):return post(client,'login',dict(email='test@example.com',password='test-only-password'))

def age_session(app,expired=False):
    with app.app_context(),db() as cur:
        cur.execute("UPDATE extension_sessions SET last_active_at=NOW()-INTERVAL '1 day',rotated_at=NOW()-INTERVAL '1 day',expires_at=NOW()+INTERVAL '2 days'")
        if expired:cur.execute("UPDATE extension_sessions SET expires_at=NOW()-INTERVAL '1 second'")

def test_cookies_server_identity_and_no_tokens(app,client):
    r=login(client);assert r.status_code==200
    assert r.json['authenticated'] and not r.json['linked']
    assert all(x not in str(r.json) for x in ['test@example','access_token','refresh_token','sessionToken','user_id'])
    cookies=r.headers.getlist('Set-Cookie')
    assert len(cookies)==2 and all('HttpOnly' in x and 'Secure' in x and 'SameSite=None' in x for x in cookies)
    assert 'Max-Age=604' in cookies[1]
    assert post(client,'session',{'user_id':999,'sellerId':'999'}).status_code==200

def test_denied_uniform_no_enumeration_and_csrf(app,client,caplog):
    missing=post(client,'session')
    wrong=post(client,'login',{'email':'test@example.com','password':'wrong'})
    unknown=post(client,'login',{'email':'absent@example.com','password':'wrong'})
    assert [x.status_code for x in [missing,wrong,unknown]]==[404]*3
    assert missing.json==wrong.json==unknown.json=={'error':'not_found'}
    assert 'status=403' in caplog.text and 'wrong' not in caplog.text and 'absent@example' not in caplog.text
    login(client)
    assert client.post('/api/extension/logout',base_url=BASE,json={}).status_code==404
    assert post(client,'session',origin='https://evil.test').status_code==404
    assert post(client,'session').status_code==200
    assert client.options('/api/extension/session',base_url=BASE,headers={'Origin':ORIGIN}).headers['Access-Control-Allow-Origin']==ORIGIN

def test_inactivity_only_activity_renews_and_expiry_never_revives(app,client):
    login(client);age_session(app)
    old=client.get_cookie(REFRESH,domain='novai.test').value
    with app.app_context(),db() as cur:
        cur.execute('SELECT expires_at FROM extension_sessions');before=cur.fetchone()['expires_at']
    assert post(client,'session').status_code==200
    assert client.get_cookie(REFRESH,domain='novai.test').value==old
    with app.app_context(),db() as cur:
        cur.execute('SELECT expires_at FROM extension_sessions');assert cur.fetchone()['expires_at']==before
    assert post(client,'activity').status_code==200
    assert client.get_cookie(REFRESH,domain='novai.test').value!=old
    with app.app_context(),db() as cur:
        cur.execute('SELECT expires_at FROM extension_sessions');assert cur.fetchone()['expires_at']>now()+timedelta(days=6)
    age_session(app,True);assert post(client,'activity').status_code==404

def test_parallel_refresh_grace_and_old_reuse_revokes(app,client):
    login(client);age_session(app);old=client.get_cookie(REFRESH,domain='novai.test').value
    post(client,'activity');current=client.get_cookie(REFRESH,domain='novai.test').value
    client.set_cookie(REFRESH,old,domain='novai.test')
    assert post(client,'activity').status_code==200
    assert client.get_cookie(REFRESH,domain='novai.test').value==current
    with app.app_context(),db() as cur:cur.execute("UPDATE extension_sessions SET rotated_at=NOW()-INTERVAL '1 minute'")
    client.set_cookie(REFRESH,old,domain='novai.test');assert post(client,'session').status_code==404
    client.set_cookie(REFRESH,current,domain='novai.test');assert post(client,'session').status_code==404

def test_logout_password_change_and_forged_jwt(app,client):
    login(client);access=client.get_cookie(ACCESS,domain='novai.test').value;refresh=client.get_cookie(REFRESH,domain='novai.test').value
    assert post(client,'logout').status_code==200
    client.set_cookie(ACCESS,access,domain='novai.test');client.set_cookie(REFRESH,refresh,domain='novai.test')
    assert post(client,'connection').status_code==404
    login(client)
    client.set_cookie(ACCESS,'forged',domain='novai.test')
    assert post(client,'connection').status_code==404
    login(client)
    with app.app_context(),db() as cur:cur.execute('UPDATE usuarios SET auth_version=auth_version+1 WHERE id=%s',(app.test_user,))
    assert post(client,'session').status_code==404

def test_page_id_is_advisory_and_never_selects_credentials(app,client):
    with app.app_context(),db() as cur:
        cur.execute('INSERT INTO contas_mercado_livre(usuario_id,id_ml,acess_token,refresh_token,expiracao_token) VALUES(%s,12345,%s,%s,%s)',(app.test_user,'server-token','server-refresh',now()+timedelta(days=1)))
    login(client)
    assert post(client,'session',{'observedIds':['999']}).json['accountState']=='mismatch'
    assert post(client,'session',{'observedIds':['888','12345']}).json['accountState']=='match'
    assert post(client,'session',{'observedIds':[]}).json['accountState']=='unknown'
    with patch('extension_api.ml_token',return_value='secret-never-returned') as token:
        r=post(client,'connection',{'user_id':999,'observedIds':['999']})
        assert r.json=={'connection':'ready'};token.assert_called_once_with(app.test_user)
    assert post(client,'session',{'observedIds':['../../']}).status_code==400

def test_oauth_bound_to_session_and_single_use(app,client):
    login(client);start=post(client,'connect');assert start.status_code==200
    params=parse_qs(urlsplit(start.json['url']).query)
    assert params['code_challenge_method']==['S256']
    state=params['state'][0]
    anonymous=app.test_client()
    with patch('extension_api.requests.post') as upstream:
        assert anonymous.get('/extension-callback?state='+state+'&code=fake',base_url=BASE).status_code==404
        upstream.assert_not_called()
    response=Mock(ok=True);response.json.return_value=dict(access_token='fake-ml-token',refresh_token='fake-ml-refresh',expires_in=3600,user_id=56789)
    with patch('extension_api.requests.post',return_value=response) as upstream:
        result=client.get('/extension-callback?state='+state+'&code=fake',base_url=BASE)
        assert result.status_code==302 and result.headers['Location']==BASE+'/api/extension/account?connected=1'
        assert client.get('/extension-callback?state='+state+'&code=fake',base_url=BASE).status_code==404
        assert upstream.call_count==1
    assert post(client,'session',{'observedIds':['56789']}).json['accountState']=='match'

def test_registration_terms_and_account_update(app,client):
    data=dict(email='new@example.test',name='Nova Conta',password='valid-new-password',acceptedTerms=True,termsVersion='2026-10-15')
    assert post(client,'register',{**data,'acceptedTerms':False}).status_code==404
    assert post(client,'register',data).status_code==201
    assert post(client,'register',data).json=={'error':'not_found'}
    page=client.get('/api/extension/account',base_url=BASE)
    assert page.status_code==200 and "frame-ancestors 'none'" in page.headers['Content-Security-Policy']
    with patch('precify_realtime.disconnect_account') as disconnect:
        assert post(client,'complete',dict(password='valid-new-password',newPassword='new-strong-password',acceptedTerms=True,termsVersion='2026-10-15')).status_code==200
        disconnect.assert_called_once()
    assert post(client,'session').status_code==200

def test_actual_concurrent_activity_rotates_once(app,client):
    from concurrent.futures import ThreadPoolExecutor
    login(client);age_session(app)
    original=client.get_cookie(REFRESH,domain='novai.test').value
    def worker(_):
        other=app.test_client();other.set_cookie(REFRESH,original,domain='novai.test')
        response=post(other,'activity')
        return response.status_code,other.get_cookie(REFRESH,domain='novai.test').value
    with ThreadPoolExecutor(max_workers=2) as pool:result=list(pool.map(worker,range(2)))
    assert result[0]==result[1] and result[0][0]==200 and result[0][1]!=original
    with app.app_context(),db() as cur:
        cur.execute('SELECT generation,refresh_hash FROM extension_sessions');row=cur.fetchone()
        assert row['generation']==1 and row['refresh_hash'] not in (original,result[0][1])

def test_unknown_refresh_cannot_revoke_valid_session_and_oauth_logout(app,client):
    login(client);saved=client.get_cookie(REFRESH,domain='novai.test').value
    attacker=app.test_client();attacker.set_cookie(REFRESH,saved.split('.')[0]+'.'+'0'*64,domain='novai.test')
    assert post(attacker,'session').status_code==404
    assert post(client,'session').status_code==200
    start=post(client,'connect');state=parse_qs(urlsplit(start.json['url']).query)['state'][0]
    post(client,'logout')
    client.set_cookie(REFRESH,saved,domain='novai.test')
    with patch('extension_api.requests.post') as upstream:
        assert client.get('/extension-callback?state='+state+'&code=fake',base_url=BASE).status_code==404
        upstream.assert_not_called()


def date_reply(status, data):
    from unittest.mock import MagicMock
    response=MagicMock(status_code=status,content=b'{}')
    response.__enter__.return_value=response
    response.json.return_value=data
    return response


def test_item_date_uses_account_token_and_listing_first(app,client):
    login(client)
    item='MLB6203834422';iso='2026-01-27T23:33:16.887Z'
    with patch('extension_api.ml_token',return_value='server-only-token') as token, patch('extension_api.requests.get',return_value=date_reply(200,{'id':item,'date_created':iso,'private':'never-return'})) as upstream:
        result=post(client,'items/created-at',{'item_id':item,'user_id':999,'access_token':'client-forged-token'})
        assert result.status_code==200
        assert result.json=={'itemId':item,'createdAt':{'iso':iso,'source':'ml_item'}}
        token.assert_called_once_with(app.test_user)
        upstream.assert_called_once_with('https://api.mercadolibre.com/items/'+item,params={'attributes':'id,date_created'},headers={'Accept':'application/json','Authorization':'Bearer server-only-token'},timeout=(3,5),allow_redirects=False)
        assert 'token' not in str(result.json) and 'private' not in str(result.json)
        assert result.headers['Cache-Control']=='no-store'


def test_item_date_description_fallback_missing_invalid_and_denial(app,client,caplog):
    login(client);item='MLB6203834422';iso='2026-01-27T23:33:16.887Z'
    with patch('extension_api.ml_token',return_value='server-only-token'):
        with patch('extension_api.requests.get',side_effect=[date_reply(403,{'error':'PolicyAgent'}),date_reply(200,{'date_created':iso,'last_updated':'2026-02-01T00:00:00Z'})]) as upstream:
            result=post(client,'items/created-at',{'item_id':item})
            assert result.json['createdAt']=={'iso':iso,'source':'ml_description'}
            assert upstream.call_args.args[0].endswith('/'+item+'/description')
        for data in [{'last_updated':iso},{'date_created':'2099-01-01T00:00:00Z'},{'date_created':'2026-01-01T00:00:00'}]:
            with patch('extension_api.requests.get',side_effect=[date_reply(200,{'id':'MLB1111111','date_created':iso}),date_reply(200,data)]):
                assert post(client,'items/created-at',{'item_id':item}).json=={'itemId':item,'createdAt':None}
        with patch('extension_api.requests.get',side_effect=[date_reply(403,{}),date_reply(404,{})]):
            assert post(client,'items/created-at',{'item_id':item}).json['createdAt'] is None
        with patch('extension_api.requests.get',return_value=date_reply(403,{'private':'must-not-leak'})):
            result=post(client,'items/created-at',{'item_id':item})
            assert result.status_code==404 and result.json=={'error':'not_found'}
        assert 'status=403' in caplog.text and 'server-only-token' not in caplog.text and 'must-not-leak' not in caplog.text


def test_item_date_requires_session_and_valid_id_before_upstream(app,client):
    with patch('extension_api.ml_token') as token,patch('extension_api.requests.get') as upstream:
        assert post(client,'items/created-at',{'item_id':'MLB6203834422'}).status_code==404
        login(client)
        for item in ['MLBU3764123782','../../users/me','https://evil.test','MLB1',123,None]:
            assert post(client,'items/created-at',{'item_id':item}).status_code==400
        token.assert_not_called();upstream.assert_not_called()


def test_item_date_refreshes_expired_ml_token_on_server(app,client):
    login(client)
    with app.app_context(),db() as cur:
        cur.execute('INSERT INTO contas_mercado_livre(usuario_id,id_ml,acess_token,refresh_token,expiracao_token) VALUES(%s,12345,%s,%s,%s)',(app.test_user,'expired-test-token','server-refresh-token',now()-timedelta(days=1)))
    renewed=Mock(ok=True)
    renewed.json.return_value={'access_token':'renewed-test-token','refresh_token':'rotated-test-refresh','expires_in':3600}
    with patch('precify_api.requests.post',return_value=renewed) as refresh,patch('extension_api.requests.get',return_value=date_reply(200,{'id':'MLB6203834422','date_created':'2026-01-27T23:33:16.887Z'})) as upstream:
        assert post(client,'items/created-at',{'item_id':'MLB6203834422'}).status_code==200
        refresh.assert_called_once()
        assert refresh.call_args.kwargs['data']['refresh_token']=='server-refresh-token'
        assert upstream.call_args.kwargs['headers']['Authorization']=='Bearer renewed-test-token'
    with app.app_context(),db() as cur:
        cur.execute('SELECT acess_token,refresh_token FROM contas_mercado_livre WHERE usuario_id=%s',(app.test_user,))
        assert dict(cur.fetchone())=={'acess_token':'renewed-test-token','refresh_token':'rotated-test-refresh'}
