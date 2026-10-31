import os
from pathlib import Path
import pytest
from test_extension_auth import app, base_app, client, post, login, BASE
from precify_core import db
from saved_items import clean, product_url, ApiError


def test_url_rejects_external_hosts_and_normalizes_offer():
    for url in ('https://evil.test/MLB1234567890','javascript:alert(1)','https://user@www.mercadolivre.com.br/MLB1234567890'):
        with pytest.raises(ApiError): product_url(url)
    assert product_url('https://www.mercadolivre.com.br/produto/p/MLB12345678?wid=MLB1234567890#x')[0]=='MLB1234567890'


def test_clean_never_stores_credentials():
    item=dict(itemId='MLB1234567890',name='Produto',price=100,cost=40,profit=30,margin=30,shipping=10,fees=16,tax=4,other=0,access_token='never-store')
    _,_,result,entry=clean(dict(item=item,user_id=999))
    assert 'access_token' not in result and entry is None
    assert result['url'].startswith('https://produto.mercadolivre.com.br/')


@pytest.mark.skipif(not os.environ.get('PRECIFY_TEST_DATABASE_URL'),reason='Isolated PostgreSQL required')
def test_extension_and_app_share_owner_and_migration_does_not_resurrect(app,client):
    with app.app_context(),db() as cur:
        schema=(Path(__file__).parents[2]/'database/saved_items.sql').read_text();cur.execute(schema);cur.execute(schema)
    assert post(client,'saved-items').status_code==404
    assert login(client).json['user']['email']=='test@example.com'
    item=dict(itemId='MLB1234567890',name='Produto',price=100,cost=40,profit=30,margin=30,shipping=10,fees=16,tax=4,other=0)
    response=post(client,'saved-items',dict(action='upsert',item=item,user_id=999))
    assert response.status_code==200 and len(response.json['items'])==1
    rows=client.get('/api/precify/saved-items',headers=app.headers).json['items']
    assert rows[0]['key']==item['itemId']
    assert client.post('/api/precify/saved-items',headers=app.headers,json=dict(action='remove',key=item['itemId'])).status_code==200
    assert post(client,'saved-items',dict(action='import',item=item)).json['items'][0]['deleted']
    with app.app_context(),db() as cur:
        cur.execute('SELECT DISTINCT user_id FROM novai_saved_items');assert cur.fetchone()['user_id']==app.test_user
    assert client.get('/api/precify/saved-items').status_code==401
    assert post(client,'saved-items',dict(action='upsert',item=item,expectedAccount='other@example.com')).status_code==404
    from precify_core import new_session
    with app.app_context(),db() as cur:
        cur.execute("INSERT INTO usuarios(usuario,email,senha,password_policy_version) VALUES('Other','other@example.com','unused',1) RETURNING id")
        other=cur.fetchone()['id']; token=new_session(cur,other)
        cur.execute("INSERT INTO precify_consents(user_id,purpose,version) VALUES(%s,'precify_terms','2026-10-15')",(other,))
    headers={'X-Precify-Session':token}
    assert client.get('/api/precify/saved-items',headers=headers).json['items']==[]
    client.post('/api/precify/saved-items',headers=headers,json=dict(action='remove',key=item['itemId']))
    assert len(client.get('/api/precify/saved-items',headers=app.headers).json['items'])==1
