"""Real isolated PostgreSQL; upstream ML responses are deterministic fixtures, never production."""
import json
from pathlib import Path
from datetime import date,datetime,timedelta,timezone
from unittest.mock import patch,Mock
import pytest
from flask_jwt_extended import JWTManager,create_access_token
from psycopg2.extras import Json
from test_precify_v2 import app,client,DSN
from precify_core import db,ApiError
from seller_dashboard import panel
from seller_sync import enqueue,run_once,clean_order,step
pytestmark=pytest.mark.skipif(not DSN,reason='Isolated PostgreSQL required')
ORIGIN='https://novai-panel.example'
DAY=date(2026,11,4)
KEY='MLB1234567890'

@pytest.fixture
def setup(app,monkeypatch):
    monkeypatch.setenv('FRONTEND_URL',ORIGIN)
    monkeypatch.setattr('seller_sync.today',lambda:DAY)
    monkeypatch.setattr('seller_dashboard.today',lambda:DAY)
    app.register_blueprint(panel)
    app.config['JWT_SECRET_KEY']='isolated-test-panel-secret-key-long-enough'
    JWTManager(app)
    with app.app_context(),db() as cur:
        cur.execute((Path(__file__).parents[2]/'database/seller_dashboard.sql').read_text())
        cur.execute((Path(__file__).parents[2]/'database/seller_dashboard.sql').read_text())
        cur.execute((Path(__file__).parents[2]/'database/saved_items.sql').read_text())
        cur.execute("INSERT INTO contas_mercado_livre(usuario_id,acess_token,refresh_token,expiracao_token,id_ml) VALUES(%s,'test-access','test-refresh',NOW()+INTERVAL '1 day',123)",(app.test_user,))
        token=create_access_token(identity=str(app.test_user),additional_claims={'auth_version':0})
    return dict(Authorization='Bearer '+token,Origin=ORIGIN)


def post(client,headers,path,data={}):return client.post('/api/novai/dashboard'+path,headers=headers,json=data)
def snap(client,headers,start='2026-11-01',end='2026-11-04'):return client.get('/api/novai/dashboard/snapshot?start='+start+'&end='+end,headers=headers)
def fixture_order(identifier=100,items=None,status='paid',refund=0):
    return dict(id=identifier,seller={'id':123},currency_id='BRL',date_created='2026-11-02T12:00:00Z',status=status,shipping={'id':44},payments=[{'status':'approved','transaction_amount_refunded':refund}],order_items=items or [dict(item={'id':KEY,'title':'Produto'},quantity=2,unit_price=100,sale_fee=10)])

def seed(app):
    with app.app_context():enqueue(app.test_user)
    with app.app_context(),db() as cur:
        cur.execute("UPDATE seller_sync SET initialized=true,registered_on='2024-01-01',available_from='2025-11-04',nickname='Loja' WHERE user_id=%s",(app.test_user,))
        for kind in ('orders','ads'):
            for period in ('2026-10-01','2026-11-01'):
                cur.execute("INSERT INTO seller_jobs(user_id,seller_id,kind,period,state,finished_at,coverage_from) VALUES(%s,123,%s,%s,'done',NOW(),%s) ON CONFLICT DO NOTHING",(app.test_user,kind,period,period))
        cur.execute("INSERT INTO seller_products(user_id,seller_id,item_id,data) VALUES(%s,123,%s,%s)",(app.test_user,KEY,Json({'title':'Produto','price':100,'available_quantity':12,'date_created':'2026-01-01','logistic_type':'fulfillment'})))
        cur.execute('INSERT INTO seller_costs(user_id,seller_id,item_id,unit_cost,tax_percent) VALUES(%s,123,%s,30,4)',(app.test_user,KEY))
        cur.execute("INSERT INTO seller_shipping(user_id,seller_id,shipment_id,cost,units,status) VALUES(%s,123,'44',12,4,'ready')",(app.test_user,))
        for number in (100,101):
            key,day,data=clean_order(fixture_order(number),123)
            cur.execute('INSERT INTO seller_orders(user_id,seller_id,order_id,day,shipment_id,data) VALUES(%s,123,%s,%s,%s,%s)',(app.test_user,key,day,'44',Json(data)))
        cur.execute("INSERT INTO seller_ads(user_id,seller_id,day,campaign_id,campaign_name,ad_group_id,item_id,data) VALUES(%s,123,'2026-11-02','88','Campanha real','44',%s,%s)",(app.test_user,KEY,Json(dict(cost=20,direct_amount=100,indirect_amount=0,direct_units_quantity=1,indirect_units_quantity=0,clicks=30,prints=1000))))


def test_requires_jwt_origin_and_rejects_cross_account_input(app,client,setup):
    assert post(client,{'Origin':ORIGIN},'/sync').status_code==401
    assert post(client,dict(setup,Origin='https://evil.example'),'/sync').status_code==403
    assert post(client,setup,'/sync',{'user_id':999}).status_code==202
    with app.app_context(),db() as cur:
        cur.execute('SELECT DISTINCT user_id FROM seller_jobs');assert [r['user_id'] for r in cur.fetchall()]==[app.test_user]
        cur.execute('UPDATE usuarios SET auth_version=1 WHERE id=%s',(app.test_user,))
    assert snap(client,setup).status_code==401


def test_no_fixture_metrics_before_collection(app,client,setup):
    assert post(client,setup,'/sync').status_code==202
    result=snap(client,setup)
    assert result.status_code==200
    assert result.json['current']['gross'] is None
    assert result.json['current']['products']==[]
    assert result.json['progress']['collecting']
    assert 'test-access' not in json.dumps(result.json)


def test_real_aggregation_shared_shipment_and_campaign(app,client,setup):
    seed(app);result=snap(client,setup).json;c=result['current']
    assert c['orders']==2 and c['units']==4 and c['gross']==400
    assert c['fees']==40 and c['cost']==120 and c['tax']==16
    assert c['shipping']==12 # shipment shared by two orders; NOT 24
    assert c['result']==192 and c['adResult']==33
    assert c['campaigns'][0]['name']=='Campanha real' and c['campaigns'][0]['adResult']==33
    assert c['days'][1]['orders']==2


def test_missing_tax_cost_ads_are_unknown_not_zero(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute('DELETE FROM seller_costs')
        cur.execute("UPDATE seller_jobs SET finished_at=NULL,state='queued' WHERE kind='ads'")
    c=snap(client,setup).json['current']
    assert c['cost'] is None and c['tax'] is None and c['ads']==20 and c['adsPartial'] and c['result'] is None
    assert c['gross']==400 and c['complete']


def test_cost_expenses_and_shared_saved_persist(app,client,setup):
    seed(app)
    assert post(client,setup,'/cost',{'itemId':KEY,'unitCost':20,'taxPercent':0}).status_code==200
    assert snap(client,setup).json['current']['cost']==80
    assert post(client,setup,'/cost',{'itemId':'MLB9999999999','unitCost':0}).status_code==404
    expense=post(client,setup,'/expenses',{'name':'Aluguel','amount':100,'date':'2026-10-31','category':'Estrutura','recurring':True})
    assert expense.status_code==200
    assert snap(client,setup).json['expenses'][0]['recurring']
    item=dict(itemId=KEY,url='https://produto.mercadolivre.com.br/MLB-1234567890-_JM',name='Produto',price=100)
    assert post(client,setup,'/saved',{'action':'upsert','item':item}).status_code==200
    assert post(client,setup,'/saved').json['items'][0]['item']['profit'] is None
    assert post(client,setup,'/expenses',{'action':'remove','id':expense.json['id']}).status_code==200
    assert snap(client,setup).json['expenses']==[]


def test_month_backfill_and_retention_newest_first(app,client,setup):
    post(client,setup,'/sync')
    with patch('seller_sync.get',return_value={'id':123,'nickname':'Loja','registration_date':'2020-01-01T00:00:00Z'}),app.app_context():assert run_once()
    status=client.get('/api/novai/dashboard/status',headers=setup).json
    assert status['monthsTotal']==13 and status['availableFrom']=='2025-11-04'
    with app.app_context(),patch('seller_sync.step',return_value=({},True,None)) as fn:run_once(('orders',))
    assert fn.call_args.args[0]['kind']=='orders' and fn.call_args.args[0]['period']==date(2026,11,1)


def test_restart_upsert_no_duplicates_and_month_progress(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute("UPDATE seller_jobs SET state='queued',finished_at=NULL,next_at=NOW() WHERE kind='orders' AND period='2026-11-01'")
        cur.execute("UPDATE seller_jobs SET next_at=NOW()+INTERVAL '1 day' WHERE kind!='orders' OR period!='2026-11-01'")
    with patch('seller_sync.get',return_value={'paging':{'total':2},'results':[fixture_order(100),fixture_order(101)]}),app.app_context():
        run_once();run_once()
    assert snap(client,setup).json['current']['gross']==400
    with app.app_context(),db() as cur:
        cur.execute("SELECT state,cursor FROM seller_jobs WHERE kind='orders' AND period='2026-11-01'");r=cur.fetchone();assert r['state']=='done' and r['cursor']=={}


def test_dense_orders_split_without_offset_overflow(app,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute("SELECT * FROM seller_jobs WHERE kind='orders' AND period='2026-11-01'");job=cur.fetchone()
    with patch('seller_sync.get',return_value={'paging':{'total':10000},'results':[]}),app.app_context():cursor,done,_=step(job)
    assert not done and len(cursor['windows'])==2
    assert datetime.fromisoformat(cursor['windows'][0][1])+timedelta(milliseconds=1)==datetime.fromisoformat(cursor['windows'][1][0])


def test_token_refresh_and_retry_401(app,setup):
    from seller_ml import get
    with app.app_context(),db() as cur:cur.execute("UPDATE contas_mercado_livre SET expiracao_token=NOW()-INTERVAL '1 minute'")
    response=Mock(ok=True);response.json.return_value={'access_token':'rotated','refresh_token':'rotated-refresh','expires_in':21600}
    ok=Mock(ok=True,status_code=200);ok.json.return_value={'id':123}
    with patch('precify_api.requests.post',return_value=response) as refresh,patch('seller_ml.ml_http.get',return_value=ok),app.app_context():
        assert get(app.test_user,123,'/users/123')=={'id':123}
        get(app.test_user,123,'/users/123');assert refresh.call_count==1
    unauthorized=Mock(ok=False,status_code=401)
    with patch('precify_api.requests.post',return_value=response) as refresh,patch('seller_ml.ml_http.get',side_effect=[unauthorized,ok]),app.app_context():
        get(app.test_user,123,'/users/123');assert refresh.call_count==1


def test_wrong_seller_and_order_cancellation_not_double_subtracted(app,client,setup):
    seed(app)
    o=fixture_order(102,status='cancelled',refund=200);key,day,data=clean_order(o,123)
    with app.app_context(),db() as cur:cur.execute('INSERT INTO seller_orders(user_id,seller_id,order_id,day,data) VALUES(%s,123,%s,%s,%s)',(app.test_user,key,day,Json(data)))
    c=snap(client,setup).json['current'];assert c['gross']==600 and c['cancelled']==200 and c['refunded']==0 and c['net']==400
    with pytest.raises(ApiError):clean_order(o,999)
    with app.app_context(),db() as cur:cur.execute('UPDATE contas_mercado_livre SET id_ml=999')
    assert snap(client,setup).json['current']['products']==[]


def test_invalid_cost_and_expense_numbers(app,client,setup):
    seed(app)
    for value in (True,-1,'12',float('inf')):
        assert post(client,setup,'/cost',{'itemId':KEY,'unitCost':value,'taxPercent':0}).status_code==400
    assert post(client,setup,'/expenses',{'name':'x','category':'Outros','date':'2026-11-02','amount':True}).status_code==400


def test_partial_ads_month_not_treated_as_whole_month(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:cur.execute("UPDATE seller_jobs SET coverage_from='2026-11-03' WHERE kind='ads' AND period='2026-11-01'")
    c=snap(client,setup).json['current']
    assert c['ads']==20 and c['adsPartial'] and not c['adsComplete'] and c['result'] is None


def test_leased_job_not_processed_twice_and_recovers(app,client,setup):
    post(client,setup,'/sync')
    with app.app_context(),db() as cur:cur.execute("UPDATE seller_jobs SET state='running',lease='previous',lease_until=NOW()+INTERVAL '1 hour'")
    with app.app_context(),patch('seller_sync.step') as work:assert not run_once();assert not work.called
    with app.app_context(),db() as cur:cur.execute("UPDATE seller_jobs SET lease_until=NOW()-INTERVAL '1 minute'")
    with app.app_context(),patch('seller_sync.step',return_value=({},True,None)) as work:assert run_once();assert work.call_count==1


def test_permission_failure_isolated_from_orders(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute("UPDATE seller_jobs SET next_at=NOW()+INTERVAL '1 day'")
        cur.execute("UPDATE seller_jobs SET next_at=NOW(),state='queued',finished_at=NULL WHERE kind='ads' AND period='2026-11-01'")
    with app.app_context(),patch('seller_sync.step',side_effect=ApiError('ml_permission_required',403)):run_once()
    c=snap(client,setup).json
    assert c['current']['gross']==400 and c['current']['ads']==20 and c['current']['adsPartial']
    assert 'ml_permission_required' in c['progress']['warnings']


def test_new_ads_endpoints_are_used_and_paginated(app,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute("SELECT * FROM seller_jobs WHERE kind='ads' AND period='2026-11-01'");job=cur.fetchone()
    calls=[]
    def upstream(u,s,path,params,headers):
        calls.append(path)
        if path=='/advertising/advertisers':return {'advertisers':[{'advertiser_id':55,'site_id':'MLB'}]}
        if path.endswith('/ad_groups/search'):return {'paging':{'total':1},'results':[{'id':44,'campaign_id':88}]}
        if path.endswith('/campaigns/88'):return {'name':'Campanha real'}
        if path.endswith('/ad_groups/44/ads'):return {'paging':{'total':1},'results':[{'item_id':KEY,'title':'Produto','metrics':{k:1 for k in ('cost','clicks','prints','direct_amount','indirect_amount','direct_units_quantity','indirect_units_quantity')}}]}
        raise AssertionError(path)
    with app.app_context(),patch('seller_sync.get',side_effect=upstream):cursor,done,_=step(job)
    assert not done and cursor['day']=='2026-11-02'
    assert not any('/product_ads/items' in p for p in calls)
    with app.app_context(),db() as cur:
        cur.execute('SELECT data FROM seller_products WHERE item_id=%s',(KEY,));assert cur.fetchone()['data']['available_quantity']==12


def test_first_partial_order_month_is_not_complete(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute("UPDATE seller_jobs SET coverage_from='2026-11-03' WHERE kind='orders' AND period='2026-11-01'")
    assert snap(client,setup).json['current']['complete'] is False


def test_missing_payments_do_not_assert_zero_refund():
    order=fixture_order(103);order['payments']=[]
    assert clean_order(order,123)[2]['refunded'] is None


def test_catalog_lane_does_not_wait_for_orders(app,client,setup):
    post(client,setup,'/sync')
    with patch('seller_sync.get',return_value={'id':123,'nickname':'Loja','registration_date':'2020-01-01T00:00:00Z'}),app.app_context():run_once(('profile',))
    with app.app_context(),db() as cur:
        cur.execute("UPDATE seller_jobs SET state='running',lease='slow-orders',lease_until=NOW()+INTERVAL '10 minutes' WHERE kind='orders' AND period='2026-11-01'")
    with app.app_context(),patch('seller_sync.step',return_value=({},True,None)) as work:
        assert run_once(('profile','catalog','ads'))
        assert work.call_args.args[0]['kind']=='catalog'
    with app.app_context(),patch('seller_sync.step') as work:
        assert not run_once(('orders',))
        assert not work.called


def test_ads_collected_before_orders_are_visible_but_profit_is_pending(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute('DELETE FROM seller_orders')
        cur.execute("UPDATE seller_jobs SET finished_at=NULL,state='queued' WHERE kind='orders'")
    data=snap(client,setup).json
    assert data['current']['ads']==20 and data['current']['adRevenue']==100
    assert data['current']['gross'] is None and data['current']['result'] is None
    assert data['progress']['sources']['ads']['ready']
    assert not data['progress']['sources']['orders']['ready']


def test_order_search_uses_supported_filters_and_separate_cancellations(app,setup):
    seed(app)
    with app.app_context(),db() as cur:
        cur.execute("SELECT * FROM seller_jobs WHERE kind='orders' AND period='2026-11-01'");job=cur.fetchone()
    with patch('seller_sync.get',return_value={'paging':{'total':0},'results':[]}) as upstream,app.app_context():
        cursor,done,_=step(job)
        assert not done and cursor['order_status']=='cancelled'
        assert 'order.status' not in upstream.call_args.args[3]
        job['cursor']=cursor
        assert step(job)[1]
        assert upstream.call_args.args[3]['order.status']=='cancelled'
