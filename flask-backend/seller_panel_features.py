"""Account-owned panel operations. No demo data and no implicit marketplace writes."""
import calendar
import math
import re
from datetime import date,timedelta
from uuid import UUID
from flask import jsonify,request
from psycopg2.extras import Json
from precify_core import ApiError,db,rate_limit,now
from novai_billing import web_identity,payload
from seller_sync import ITEM


def number(value,maximum=1000000,nullable=True,integer=False):
    if value is None and nullable:return None
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=maximum or integer and value!=int(value):raise ApiError('invalid_value')
    return value


def settings(cur,u,s):
    cur.execute('SELECT version,data FROM seller_panel_settings WHERE user_id=%s AND seller_id=%s',(u,s));row=cur.fetchone() or dict(version=0,data={})
    import copy
    data=copy.deepcopy(row['data'])
    cur.execute('SELECT item_id,unit_cost,tax_percent FROM seller_costs WHERE user_id=%s AND seller_id=%s',(u,s))
    data['costs']={};products=data.setdefault('productSettings',{})
    for r in cur.fetchall():
        data['costs'][r['item_id']]=float(r['unit_cost']) if r['unit_cost'] is not None else None
        products.setdefault(r['item_id'],{})['taxRate']=float(r['tax_percent']) if r['tax_percent'] is not None else None
    cur.execute('SELECT * FROM seller_expenses WHERE user_id=%s AND seller_id=%s ORDER BY day,id',(u,s))
    data['expenses']=[dict(id=str(r['id']),name=r['name'],category=r['category'],amount=float(r['amount']),date=r['day'].isoformat(),recurring=r['recurring'],expenseType=r['expense_type'],**({'installments':r['installments']} if r['installments'] else {})) for r in cur.fetchall()]
    # Count only sales created AFTER the manual count. Late imports of old history
    # must not consume today's warehouse balance. Unknown creation times stay out.
    tracked={k:v for k,v in products.items() if v.get('manageStock') and v.get('warehouseStock') is not None and v.get('warehouseCountedAt')}
    consumed={}
    if tracked:
        earliest=min(v['warehouseCountedAt'][:10] for v in tracked.values())
        cur.execute("""SELECT l->>'id' AS item_id,SUM((l->>'quantity')::numeric) AS units
            FROM seller_orders o JOIN seller_shipping h USING(user_id,seller_id,shipment_id)
            CROSS JOIN LATERAL jsonb_array_elements(o.data->'lines') l
            WHERE o.user_id=%s AND o.seller_id=%s AND o.day>=%s::date-1
            AND o.data->>'status' IN ('paid','partially_refunded')
            AND h.logistic_type IS NOT NULL AND h.logistic_type!='fulfillment'
            AND (o.data->>'createdAt')::timestamptz > ((%s::jsonb -> (l->>'id'))->>'warehouseCountedAt')::timestamptz
            GROUP BY l->>'id'""",(u,s,earliest,Json(tracked)))
        consumed={r['item_id']:float(r['units']) for r in cur.fetchall()}
    for key,setting in products.items():
        if key in tracked:setting['warehouseStock']=max(0,setting['warehouseStock']-consumed.get(key,0))
        setting.pop('warehouseBaseline',None);setting.pop('warehouseCountedAt',None)
    return dict(version=row['version'],data=data)


def expense(value):
    from seller_dashboard import parse_day
    if not isinstance(value,dict):raise ApiError('invalid_expense')
    try:key=str(UUID(value.get('id','').removeprefix('expense-')))
    except (ValueError,TypeError,AttributeError):raise ApiError('invalid_expense') from None
    name=value.get('name');category=value.get('category');day=parse_day(value.get('date'))
    amount=number(value.get('amount'),nullable=False);recurring=value.get('recurring',False)
    kind=value.get('expenseType','fixed');installments=value.get('installments')
    if not isinstance(name,str) or not 1<=len(name.strip())<=100 or not isinstance(category,str) or not 1<=len(category.strip())<=60 or not isinstance(recurring,bool) or kind not in ('fixed','operational') or amount<=0 or not date(1999,1,1)<=day<=date(2099,12,31):raise ApiError('invalid_expense')
    if installments is not None:
        number(installments,120,False,True)
        if not recurring or installments<2:raise ApiError('invalid_expense')
    return key,name.strip(),category.strip(),amount,day,recurring,kind,installments


def register(panel):
    from seller_dashboard import scope,progress,product,aggregate,parse_day,today

    @panel.get('/bootstrap')
    def bootstrap():
        user=web_identity();u=user['id']
        try:_,s=scope()
        except ApiError as exc:
            if exc.code not in ('ml_connection_required','ml_reconnect_required'):raise
            return jsonify(user={'email':user['email']},connected=False,version=0,data={},products=[],progress=None)
        with db() as cur:
            state=progress(cur,u,s);pref=settings(cur,u,s)
            cur.execute('SELECT item_id,data FROM seller_products WHERE user_id=%s AND seller_id=%s ORDER BY item_id',(u,s))
            products=[product(r['item_id'],r['data'],{}) for r in cur.fetchall()]
        return jsonify(user={'email':user['email']},connected=True,sellerId=str(s),products=products,progress=state,**pref)

    @panel.get('/month')
    def month():
        u,s=scope();start=parse_day(request.args.get('start'));end=min(start.replace(day=calendar.monthrange(start.year,start.month)[1]),today())
        if start.day!=1 or start<date(1999,1,1) or start>end:raise ApiError('invalid_date_range')
        with db() as cur:
            cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');cur.execute("SET LOCAL statement_timeout='20000ms'")
            state=progress(cur,u,s)
            cur.execute('SELECT item_id,unit_cost,tax_percent FROM seller_costs WHERE user_id=%s AND seller_id=%s',(u,s))
            costs={r['item_id']:dict(cost=float(r['unit_cost']) if r['unit_cost'] is not None else None,tax=float(r['tax_percent']) if r['tax_percent'] is not None else None) for r in cur.fetchall()}
            cur.execute('SELECT item_id,data FROM seller_products WHERE user_id=%s AND seller_id=%s',(u,s));products=[product(r['item_id'],r['data'],costs) for r in cur.fetchall()]
            result=aggregate(cur,u,s,start,end,products,costs,state,include_records=True)
        return jsonify(start=start.isoformat(),end=end.isoformat(),progress=state,**result)

    @panel.post('/preferences')
    def preferences():
        u,s=scope();rate_limit('panel-write:'+str(u),limit=100)
        body=payload();changes=body.get('changes');version=body.get('version')
        if type(version) is not int or version<0 or not isinstance(changes,dict) or set(changes)-{'costs','productSettings','expenses','expenseCategories','listingUpdates','eanHistory'}:raise ApiError('invalid_preferences')
        with db() as cur:
            cur.execute('INSERT INTO seller_panel_settings(user_id,seller_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(u,s))
            cur.execute('SELECT version,data FROM seller_panel_settings WHERE user_id=%s AND seller_id=%s FOR UPDATE',(u,s));row=cur.fetchone()
            if row['version']!=version:raise ApiError('preferences_changed',409)
            state=dict(row['data']);cur.execute('SELECT item_id FROM seller_products WHERE user_id=%s AND seller_id=%s',(u,s));ids={r['item_id'] for r in cur.fetchall()}
            for group in ('costs','productSettings','listingUpdates'):
                mapping=changes.get(group,{})
                if not isinstance(mapping,dict) or len(mapping)>5000 or set(mapping)-ids:raise ApiError('invalid_product_settings')
                for key,value in mapping.items():
                    if group=='costs':
                        amount=number(value)
                        cur.execute('INSERT INTO seller_costs(user_id,seller_id,item_id,unit_cost) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,item_id) DO UPDATE SET unit_cost=EXCLUDED.unit_cost,updated_at=NOW()',(u,s,key,amount))
                    elif group=='productSettings':
                        if not isinstance(value,dict) or set(value)-{'taxRate','manageStock','warehouseStock'}:raise ApiError('invalid_product_settings')
                        tax=number(value.get('taxRate'),100)
                        if type(value.get('manageStock',False)) is not bool:raise ApiError('invalid_product_settings')
                        number(value.get('warehouseStock'),integer=True)
                        old=state.setdefault(group,{}).get(key,{})
                        # A manual count starts a new ledger window. Backfilled older orders
                        # never reduce the freshly counted balance.
                        counted_at=old.get('warehouseCountedAt')
                        if value.get('warehouseStock')!=old.get('warehouseStock') or value.get('manageStock') and not old.get('manageStock'):
                            counted_at=now().isoformat()
                        state[group][key]={**value,'warehouseCountedAt':counted_at}
                        cur.execute('INSERT INTO seller_costs(user_id,seller_id,item_id,tax_percent) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,item_id) DO UPDATE SET tax_percent=EXCLUDED.tax_percent,updated_at=NOW()',(u,s,key,tax))
                    else:
                        if not isinstance(value,dict) or set(value)!={'price'}:raise ApiError('invalid_price')
                        number(value['price'],nullable=False)
                        if value['price']<=0:raise ApiError('invalid_price')
                        state.setdefault(group,{})[key]=value # Price study only. Never updates Mercado Livre.
            if 'expenses' in changes:
                values=changes['expenses']
                if not isinstance(values,list) or len(values)>5000:raise ApiError('invalid_expense')
                rows=[expense(v) for v in values]
                if len({r[0] for r in rows})!=len(rows):raise ApiError('duplicate_expense')
                cur.execute('DELETE FROM seller_expenses WHERE user_id=%s AND seller_id=%s AND NOT(id=ANY(%s::uuid[]))',(u,s,[r[0] for r in rows]))
                for r in rows:
                    cur.execute('INSERT INTO seller_expenses(user_id,seller_id,id,name,category,amount,day,recurring,expense_type,installments) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,amount=EXCLUDED.amount,day=EXCLUDED.day,recurring=EXCLUDED.recurring,expense_type=EXCLUDED.expense_type,installments=EXCLUDED.installments',(u,s,*r))
            if 'expenseCategories' in changes:
                values=changes['expenseCategories']
                if not isinstance(values,list) or len(values)>200 or any(not isinstance(v,str) or not 1<=len(v.strip())<=60 for v in values):raise ApiError('invalid_category')
                state['expenseCategories']=list(dict.fromkeys(v.strip() for v in values))
            if 'eanHistory' in changes:
                values=changes['eanHistory'];seen=set()
                if not isinstance(values,list) or len(values)>5000:raise ApiError('invalid_ean')
                cleaned=[]
                for v in values:
                    if not isinstance(v,dict):raise ApiError('invalid_ean')
                    code=v.get('code');sku=v.get('skuId');created=v.get('createdAt')
                    if not isinstance(code,str) or not re.fullmatch(r'\d{13}',code) or sum(int(c)*(1 if i%2==0 else 3) for i,c in enumerate(code))%10 or code in seen or sku is not None and sku not in ids or type(created) not in (int,float) or not math.isfinite(created) or not 0<created<4102444800000:raise ApiError('invalid_ean')
                    seen.add(code);cleaned.append(dict(code=code,skuId=sku,createdAt=created))
                state['eanHistory']=cleaned
            cur.execute('UPDATE seller_panel_settings SET data=%s,version=version+1,updated_at=NOW() WHERE user_id=%s AND seller_id=%s',(Json(state),u,s))
            cur.execute('UPDATE seller_sync SET revision=revision+1 WHERE user_id=%s AND seller_id=%s',(u,s))
        return jsonify(ok=True,version=version+1)

    @panel.get('/visits')
    def visits():
        from seller_ml import get
        u,s=scope();key=request.args.get('itemId','');start=parse_day(request.args.get('start'));end=parse_day(request.args.get('end'))
        if not ITEM.fullmatch(key) or start>end or end>today() or (end-start).days>=150:raise ApiError('invalid_visits_range')
        with db() as cur:
            cur.execute('SELECT 1 FROM seller_products WHERE user_id=%s AND seller_id=%s AND item_id=%s',(u,s,key))
            if not cur.fetchone():raise ApiError('item_not_found',404)
            cur.execute("SELECT data FROM seller_visit_cache WHERE user_id=%s AND seller_id=%s AND item_id=%s AND start_day=%s AND end_day=%s AND updated_at>NOW()-INTERVAL '30 minutes'",(u,s,key,start,end));cached=cur.fetchone()
            if cached:return jsonify(cached['data'])
        rate_limit('panel-visits:'+str(u),limit=60)
        response=get(u,s,'/items/'+key+'/visits/time_window',dict(last=(end-start).days+1,unit='day',ending=(end+timedelta(days=1)).isoformat()))
        if not isinstance(response,dict) or response.get('item_id')!=key or not isinstance(response.get('results'),list):raise ApiError('ml_invalid_response',502)
        rows=[]
        for r in response['results']:
            day=parse_day(str(r.get('date',''))[:10]);value=number(r.get('total'),10**12,False,True)
            if start<=day<=end:rows.append(dict(day=day.isoformat(),visits=value))
        result=dict(itemId=key,days=rows)
        with db() as cur:cur.execute('INSERT INTO seller_visit_cache(user_id,seller_id,item_id,start_day,end_day,data) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,item_id,start_day,end_day) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()',(u,s,key,start,end,Json(result)))
        return jsonify(result)

    @panel.get('/catalog-price')
    def catalog_price():
        from seller_ml import get
        u,s=scope();key=request.args.get('itemId','')
        if not ITEM.fullmatch(key):raise ApiError('invalid_item_id')
        with db() as cur:
            cur.execute('SELECT data FROM seller_products WHERE user_id=%s AND seller_id=%s AND item_id=%s',(u,s,key));item=cur.fetchone()
        if not item:raise ApiError('item_not_found',404)
        if not item['data'].get('catalog_listing'):raise ApiError('not_catalog_item')
        rate_limit('panel-catalog:'+str(u),limit=60)
        data=get(u,s,'/items/'+key+'/price_to_win',{'siteId':'MLB','version':'v2'})
        if not isinstance(data,dict) or data.get('item_id')!=key or data.get('currency_id')!='BRL':raise ApiError('ml_invalid_response',502)
        return jsonify(itemId=key,priceToWin=number(data.get('price_to_win'),10**10),status=data.get('status'))

    @panel.post('/listing-price')
    def listing_price():
        from seller_ml import get,update_price
        u,s=scope();body=payload();key=body.get('itemId','')
        value=number(body.get('price'),nullable=False);expected=number(body.get('expectedPrice'),nullable=False)
        if not isinstance(key,str) or not ITEM.fullmatch(key) or value<=0 or expected<=0 or body.get('confirm') is not True:raise ApiError('invalid_price')
        rate_limit('panel-price:'+str(u),limit=20)
        with db() as cur:
            cur.execute('SELECT 1 FROM seller_products WHERE user_id=%s AND seller_id=%s AND item_id=%s',(u,s,key))
            if not cur.fetchone():raise ApiError('item_not_found',404)
        current=get(u,s,'/items/'+key)
        if current.get('seller_id')!=s or current.get('currency_id')!='BRL':raise ApiError('ml_owner_mismatch',403)
        if current.get('price')!=expected:raise ApiError('listing_price_changed',409)
        result=update_price(u,s,key,round(value,2))
        if result.get('id')!=key or result.get('price')!=round(value,2):raise ApiError('price_confirmation_pending',502)
        with db() as cur:
            cur.execute("UPDATE seller_products SET data=jsonb_set(data,'{price}',%s::jsonb),fetched_at=NOW() WHERE user_id=%s AND seller_id=%s AND item_id=%s",(Json(round(value,2)),u,s,key))
            cur.execute("UPDATE seller_panel_settings SET data=jsonb_set(data,'{listingUpdates}',COALESCE(data->'listingUpdates','{}'::jsonb)-%s),version=version+1 WHERE user_id=%s AND seller_id=%s",(key,u,s))
            cur.execute('UPDATE seller_sync SET revision=revision+1 WHERE user_id=%s AND seller_id=%s',(u,s))
        return jsonify(ok=True,price=round(value,2))

    @panel.post('/logout')
    def logout():
        u=web_identity()['id']
        with db() as cur:cur.execute('UPDATE usuarios SET auth_version=COALESCE(auth_version,0)+1 WHERE id=%s',(u,))
        return jsonify(authenticated=False)
