"""Panel v4 persistence and real monthly facts, isolated database only."""
from uuid import uuid4
from unittest.mock import patch
from psycopg2.extras import Json
from test_seller_dashboard import app,client,setup,seed,post,KEY,db,pytestmark

def get(client,auth,path):return client.get('/api/novai/dashboard'+path,headers=auth)
def save(client,auth,changes,version=0):return post(client,auth,'/preferences',dict(version=version,changes=changes))

def test_bootstrap_and_month_have_no_demo_or_buyer_data(app,client,setup):
    seed(app);b=get(client,setup,'/bootstrap').json
    assert b['connected'] and b['products'][0]['id']==KEY and b['data']['costs'][KEY]==30
    m=get(client,setup,'/month?start=2026-11-01').json
    assert m['records'][0]['orderIds']==['100','101'] and m['records'][0]['gross']==400
    assert m['adRecords'][0]['campaignId']=='88'
    assert m['records'][0]['fullUnits'] is None # Unknown logistics is never inferred from current listing.
    assert 'buyer' not in str(m) and 'access_token' not in str(b)
    assert get(client,setup,'/month?start=2026-11-02').status_code==400


def test_atomic_bulk_costs_and_conflicts(app,client,setup):
    seed(app)
    assert save(client,setup,{'costs':{KEY:25},'productSettings':{KEY:{'taxRate':5,'manageStock':True,'warehouseStock':20}}}).status_code==200
    b=get(client,setup,'/bootstrap').json;assert b['version']==1 and b['data']['costs'][KEY]==25
    assert b['data']['productSettings'][KEY]['warehouseStock']==20
    assert save(client,setup,{'costs':{KEY:22}},0).status_code==409
    # Entire batch rolls back when a later field is invalid.
    assert save(client,setup,{'costs':{KEY:10},'productSettings':{KEY:{'taxRate':101}}},1).status_code==400
    assert get(client,setup,'/bootstrap').json['data']['costs'][KEY]==25
    assert save(client,setup,{'costs':{'MLB9999999999':3}},1).status_code==400
    assert save(client,dict(setup,Origin='https://evil.example'),{'costs':{KEY:1}},1).status_code==403


def test_custom_expenses_installments_future_undo(app,client,setup):
    seed(app);key=str(uuid4());e=dict(id=key,name='Equipamento',category='Categoria própria',expenseType='operational',amount=90,date='2027-01-31',recurring=True,installments=3)
    assert save(client,setup,{'expenses':[e],'expenseCategories':['Categoria própria']}).status_code==200
    assert get(client,setup,'/bootstrap').json['data']['expenses'][0]==e
    assert save(client,setup,{'expenses':[]},1).status_code==200
    assert save(client,setup,{'expenses':[e]},2).status_code==200
    assert save(client,setup,{'expenses':[dict(e,installments=121)]},3).status_code==400
    assert len(get(client,setup,'/bootstrap').json['data']['expenses'])==1


def test_ean_validated_and_persistent(app,client,setup):
    seed(app);entry=dict(code='7891234567895',createdAt=1793790000000,skuId=KEY)
    assert save(client,setup,{'eanHistory':[entry]}).status_code==200
    assert get(client,setup,'/bootstrap').json['data']['eanHistory']==[entry]
    assert save(client,setup,{'eanHistory':[dict(entry,code='7891234567890')]},1).status_code==400
    assert save(client,setup,{'eanHistory':[dict(entry,skuId='MLB9999999999')]},1).status_code==400


def test_stock_ledger_does_not_reapply_same_sales(app,client,setup):
    seed(app)
    with app.app_context(),db() as cur:cur.execute("UPDATE seller_shipping SET logistic_type='drop_off'")
    settings={KEY:dict(taxRate=4,manageStock=True,warehouseStock=20)}
    assert save(client,setup,{'productSettings':settings}).status_code==200
    with app.app_context(),db() as cur:
        cur.execute("INSERT INTO seller_orders SELECT user_id,seller_id,'102',CURRENT_DATE,shipment_id,jsonb_set(data,'{createdAt}',to_jsonb((NOW()+INTERVAL '1 second')::text)),updated_at FROM seller_orders WHERE order_id='100'")
    assert get(client,setup,'/bootstrap').json['data']['productSettings'][KEY]['warehouseStock']==18
    assert get(client,setup,'/bootstrap').json['data']['productSettings'][KEY]['warehouseStock']==18
    # The test sale precedes the next physical count.
    with app.app_context(),db() as cur:cur.execute("UPDATE seller_orders SET data=jsonb_set(data,'{createdAt}',to_jsonb((NOW()-INTERVAL '1 second')::text)) WHERE order_id='102'")
    # Recount establishes a new baseline, not another deduction of past sales.
    assert save(client,setup,{'productSettings':{KEY:dict(taxRate=4,manageStock=True,warehouseStock=50)}},1).status_code==200
    assert get(client,setup,'/bootstrap').json['data']['productSettings'][KEY]['warehouseStock']==50


def test_visits_auth_owned_and_cached(app,client,setup):
    seed(app)
    with patch('seller_ml.get',return_value=dict(item_id=KEY,results=[dict(date='2026-11-02T00:00:00Z',total=42)])) as mock:
        path='/visits?itemId='+KEY+'&start=2026-11-01&end=2026-11-04'
        assert get(client,setup,path).json['days']==[{'day':'2026-11-02','visits':42}]
        assert get(client,setup,path).status_code==200 and mock.call_count==1
        assert get(client,setup,path.replace(KEY,'MLB9999999999')).status_code==404
        assert mock.call_args.args[2]=='/items/'+KEY+'/visits/time_window'


def test_preferences_preflight_and_logout_revokes_jwt(app,client,setup):
    seed(app)
    assert client.options('/api/novai/dashboard/preferences',headers=setup).status_code==204
    assert post(client,setup,'/logout').status_code==200
    assert get(client,setup,'/bootstrap').status_code==401


def test_publishing_price_requires_confirmation_owner_and_current_price(app,client,setup):
    seed(app);body=dict(itemId=KEY,price=120,expectedPrice=100,confirm=True)
    with patch('seller_ml.get',return_value=dict(id=KEY,seller_id=123,currency_id='BRL',price=100)),patch('seller_ml.update_price',return_value=dict(id=KEY,price=120)) as publish:
        assert post(client,setup,'/listing-price',dict(body,confirm=False)).status_code==400
        assert post(client,setup,'/listing-price',dict(body,expectedPrice=90)).status_code==409
        publish.assert_not_called()
        assert post(client,setup,'/listing-price',body).status_code==200
        publish.assert_called_once_with(app.test_user,123,KEY,120)
    assert get(client,setup,'/bootstrap').json['products'][0]['price']==120
    with patch('seller_ml.get',return_value=dict(id=KEY,seller_id=999,currency_id='BRL',price=120)),patch('seller_ml.update_price') as publish:
        assert post(client,setup,'/listing-price',dict(body,expectedPrice=120)).status_code==403
        publish.assert_not_called()
