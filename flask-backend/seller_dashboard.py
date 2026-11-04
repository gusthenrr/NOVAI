"""Authenticated dashboard snapshots and account-owned settings; no fixture metrics."""
import math
import re
from datetime import date,timedelta
from uuid import UUID,uuid4
from flask import Blueprint,jsonify,request
from precify_core import ApiError,db,rate_limit
from novai_billing import web_identity,guard,headers,payload
from seller_sync import connection,enqueue,today,ITEM,money

panel=Blueprint('seller_dashboard',__name__,url_prefix='/api/novai/dashboard')
panel.before_request(guard)
panel.after_request(headers)
@panel.errorhandler(ApiError)
def error(exc):return jsonify(error=exc.code),exc.status

FIELDS='orders units cancelledOrders gross cancelled refunded net fees tax shipping ads adRevenue adUnits clicks impressions cost result adResult'.split()
ADS='ads adRevenue adUnits clicks impressions'.split()

def zero():return dict.fromkeys(FIELDS,0)
def plus(a,b):return None if a is None or b is None else round(a+b,2)
def numeric(v):return float(v) if v is not None else None

def parse_day(value):
    try:return date.fromisoformat(value)
    except (TypeError,ValueError):raise ApiError('invalid_date') from None


def scope():
    user=web_identity()['id'];return user,connection(user)


def progress(cur,u,s):
    cur.execute('SELECT * FROM seller_sync WHERE user_id=%s AND seller_id=%s',(u,s));account=cur.fetchone()
    cur.execute('SELECT kind,period,state,error,finished_at,coverage_from FROM seller_jobs WHERE user_id=%s AND seller_id=%s ORDER BY period DESC,kind',(u,s));jobs=cur.fetchall()
    initialized=bool(account and account['initialized'])
    orders=[j for j in jobs if j['kind']=='orders']
    completed=sum(j['finished_at'] is not None for j in orders)
    pending=[j for j in jobs if j['state'] in ('queued','running','retry')]
    sources={}
    for kind in ('profile','catalog','orders','ads'):
        rows=[j for j in jobs if j['kind']==kind and j['error']!='ads_retention_90_days']
        done=sum(bool(j['finished_at']) for j in rows)
        sources[kind]=dict(total=len(rows),completed=done,ready=bool(rows) and done==len(rows),pending=any(j['state'] in ('queued','running','retry') for j in rows),failed=any(j['error'] for j in rows))
    return dict(initialized=initialized,nickname=(account or {}).get('nickname'),reputation=(account or {}).get('reputation'),registeredOn=str(account['registered_on']) if account and account['registered_on'] else None,
        availableFrom=str(account['available_from']) if account and account['available_from'] else None,revision=(account or {}).get('revision',0),
        sources=sources,monthsCompleted=completed,monthsTotal=len(orders),collecting=bool(pending) or not initialized,
        currentMonth=str(pending[0]['period']) if pending else None,
        warnings=list(dict.fromkeys(j['error'] for j in jobs if j['error'])),
        jobs=[dict(kind=j['kind'],month=j['period'].isoformat(),state=j['state'],error=j['error'],collected=bool(j['finished_at']),coverageFrom=j['coverage_from'].isoformat() if j['coverage_from'] else None) for j in jobs])


def complete_window(status,start,end,kind):
    periods={j['month'][:7]:j for j in status['jobs'] if j['kind']==kind}
    day=start
    if not status['registeredOn'] or start<parse_day(status['registeredOn']):return False
    if kind=='orders' and status['availableFrom'] and start<parse_day(status['availableFrom']):
        # Only previously collected local months may precede today's upstream retention.
        if start.isoformat()[:7] not in periods:return False
    first=periods.get(start.isoformat()[:7])
    if first and first.get('coverageFrom') and start<parse_day(first['coverageFrom']):return False
    while day<=end:
        j=periods.get(day.isoformat()[:7])
        if not j or not j['collected'] or j['error'] not in (None,'no_ads_account'):return False
        day=(day.replace(day=28)+timedelta(days=4)).replace(day=1)
    return True


def product(key,data,costs):
    created=data.get('date_created');age=None
    if created:
        try:age=(today()-parse_day(created[:10])).days
        except ApiError:pass
    stock=data.get('available_quantity');full=stock if data.get('logistic_type')=='fulfillment' else 0 if data.get('logistic_type') else None
    return dict(id=key,itemId=key,name=data.get('title') or key,sku=data.get('sku') or '',
        image=data.get('secure_thumbnail') or '',base=data.get('price'),price=data.get('price'),stock=stock,full=full,
        category=data.get('category_name') or data.get('category_id') or 'Sem categoria',categoryId=data.get('category_id'),age=age,createdAt=created[:10] if created else None,
        catalog=data.get('catalog_listing') is True,listingType='premium' if data.get('listing_type_id')=='gold_pro' else 'classic',
        permalink= 'https://produto.mercadolivre.com.br/MLB-'+key[3:]+'-_JM',
        unitCost=costs.get(key,{}).get('cost'),taxPercent=costs.get(key,{}).get('tax'),reputation=None,unitShipping=None,cover=None,lastSale=None,**zero())


def aggregate(cur,u,s,start,end,products,costs,status):
    by={p['id']:dict(p) for p in products};days={};events=[];order_ids=set();cancel_ids=set();daily_orders={};daily_cancelled={}
    cur.execute('''SELECT o.order_id,o.day,o.data,h.cost AS shipment_cost,h.units AS shipment_units
      FROM seller_orders o LEFT JOIN seller_shipping h ON h.user_id=o.user_id AND h.seller_id=o.seller_id AND h.shipment_id=o.shipment_id
      WHERE o.user_id=%s AND o.seller_id=%s AND o.day BETWEEN %s AND %s ORDER BY o.day''',(u,s,start,end))
    # Stream SQL rows rather than copying the full seller history into memory.
    while True:
        rows=cur.fetchmany(500)
        if not rows:break
        for source in rows:
            record=source['data'];state=record['status'];cancelled=state=='cancelled'
            if state not in ('paid','partially_refunded','cancelled'):continue
            key_day=source['day'].isoformat();daily=days.setdefault(key_day,dict(day=key_day,**zero()))
            gross=sum(line['price']*line['quantity'] for line in record['lines']);seen=set()
            for line in record['lines']:
                key=line['id'];p=by.setdefault(key,product(key,{'title':line['title']},costs));q=line['quantity'];amount=round(q*line['price'],2)
                share=amount/gross if gross else 0
                refund=0 if cancelled else None if record['refunded'] is None else round(record['refunded']*share,2)
                net=0 if cancelled else None if refund is None else round(amount-refund,2)
                unit_cost=costs.get(key,{}).get('cost');tax_rate=costs.get(key,{}).get('tax')
                cost=None if cancelled else None if unit_cost is None else round(unit_cost*q,2)
                fees=None if cancelled else None if line['fee'] is None else round(line['fee']*q,2)
                tax=0 if cancelled else None if tax_rate is None or net is None else round(net*tax_rate/100,2)
                # Split a shipment across ALL its seller units (including other orders), never per-order duplicate costs.
                shipping=None if cancelled else None if source['shipment_cost'] is None or not source['shipment_units'] else round(float(source['shipment_cost'])*q/float(source['shipment_units']),2)
                row=dict(orders=int(not cancelled and key not in seen),units=0 if cancelled else q,cancelledOrders=int(cancelled and key not in seen),gross=amount,cancelled=amount if cancelled else 0,refunded=refund,net=net,fees=fees,tax=tax,shipping=shipping,cost=cost)
                seen.add(key)
                for target in (p,daily):
                    for k,v in row.items():target[k]=plus(target[k],v)
                if not cancelled:p['lastSale']=key_day
                if cancelled or refund:
                    events.append(dict(day=key_day,id=key,type='Cancelamento' if cancelled else 'Reembolso',amount=amount if cancelled else refund,effect=-amount if cancelled else -refund))
            (cancel_ids if cancelled else order_ids).add(source['order_id'])
            (daily_cancelled if cancelled else daily_orders).setdefault(key_day,set()).add(source['order_id'])
    # Actual campaigns, never fabricated category groupings.
    cur.execute('SELECT day,campaign_id,campaign_name,item_id,data FROM seller_ads WHERE user_id=%s AND seller_id=%s AND day BETWEEN %s AND %s',(u,s,start,end))
    campaigns={};ad_totals=dict.fromkeys(ADS,0);ad_products=set();ad_days=set()
    for r in cur.fetchall():
        m=r['data'];daily=days.setdefault(r['day'].isoformat(),dict(day=r['day'].isoformat(),**zero()));p=by.setdefault(r['item_id'],product(r['item_id'],{},costs))
        c=campaigns.setdefault(r['campaign_id'],dict(id=r['campaign_id'],name=r['campaign_name'],products=[],productMetrics={},**zero()))
        if p['id'] not in c['products']:c['products'].append(p['id'])
        vals=dict(ads=m.get('cost'),clicks=m.get('clicks'),impressions=m.get('prints'),adRevenue=plus(m.get('direct_amount'),m.get('indirect_amount')),adUnits=plus(m.get('direct_units_quantity'),m.get('indirect_units_quantity')))
        ad_products.add(p['id']);ad_days.add(r['day'].isoformat())
        for k,v in vals.items():ad_totals[k]=plus(ad_totals[k],v)
        cp=c['productMetrics'].setdefault(p['id'],dict.fromkeys(ADS,0))
        for target in (p,daily,c,cp):
            for k,v in vals.items():target[k]=plus(target[k],v)
    ads_complete=complete_window(status,start,end,'ads');orders_complete=complete_window(status,start,end,'orders')
    total=zero();elapsed=max(1,(end-start).days+1)
    for p in by.values():
        p['complete']=orders_complete
        level=status.get('reputation') or ''
        p['reputation']='green' if level.startswith(('4','5')) else 'yellow' if level.startswith('3') else 'red' if level.startswith(('1','2')) else None
        if not ads_complete and p['id'] not in ad_products:
            for k in ADS:p[k]=None
        costs_sum=[p[k] for k in ('cost','fees','tax','shipping','ads')]
        p['result']=None if not orders_complete or not ads_complete or p['net'] is None or any(v is None for v in costs_sum) else round(p['net']-sum(costs_sum),2)
        # Attribution estimate, not causal incremental profit; unknown costs stay unknown.
        p['adResult']=None if p['result'] is None or p['adRevenue'] is None or (not p['net'] and p['adRevenue']) else round(p['adRevenue']-(sum(costs_sum[:-1])*p['adRevenue']/p['net'] if p['net'] else 0)-p['ads'],2)
        p['cover']=math.ceil(p['stock']/(p['units']/elapsed)) if orders_complete and p['units'] and p['stock'] is not None else None
        p['unitShipping']=round(p['shipping']/p['units'],2) if p['shipping'] is not None and p['units'] else None
        p['resultPerUnit']=round(p['result']/p['units'],2) if p['result'] is not None and p['units'] else None
        for k in FIELDS:total[k]=plus(total[k],p[k])
    total['orders']=len(order_ids);total['cancelledOrders']=len(cancel_ids)
    for k in ADS:total[k]=ad_totals[k] if ads_complete or ad_products else None
    if not ads_complete or not orders_complete:total['result']=total['adResult']=None
    if not orders_complete and not order_ids and not cancel_ids:
        for k in ('orders','units','gross','cancelled','cancelledOrders','refunded','net','fees','tax','shipping','cost','result','adResult'):total[k]=None
    # Only fill a zero day if the entire order month has been collected.
    d=start
    while d<=end:
        if d.isoformat() not in days and complete_window(status,d,d,'orders'):days[d.isoformat()]=dict(day=d.isoformat(),**zero())
        d+=timedelta(days=1)
    for row in days.values():
        row['orders']=len(daily_orders.get(row['day'],set()));row['cancelledOrders']=len(daily_cancelled.get(row['day'],set()))
        known_ads=complete_window(status,parse_day(row['day']),parse_day(row['day']),'ads')
        if not known_ads and row['day'] not in ad_days:
            for k in ADS:row[k]=None
        vals=[row[k] for k in ('cost','fees','tax','shipping','ads')]
        row['result']=None if not known_ads or not complete_window(status,parse_day(row['day']),parse_day(row['day']),'orders') or row['net'] is None or any(v is None for v in vals) else round(row['net']-sum(vals),2)
        row['adResult']=None if row['result'] is None or row['adRevenue'] is None else round(row['adRevenue']-(sum(vals[:-1])*row['adRevenue']/row['net'] if row['net'] else 0)-row['ads'],2)
    for c in campaigns.values():
        attributed=0
        for key,m in c.pop('productMetrics').items():
            p=by[key];variable=[p[k] for k in ('cost','fees','tax','shipping')]
            if any(v is None for v in variable) or m['adRevenue'] is None or m['ads'] is None or p['net'] is None or (not p['net'] and m['adRevenue']):
                attributed=None;break
            attributed=plus(attributed,round(m['adRevenue']-(sum(variable)*m['adRevenue']/p['net'] if p['net'] else 0)-m['ads'],2))
        c['products']=[by[k] for k in c['products']]
        c['adResult']=attributed if ads_complete and orders_complete else None
    return dict(**total,incomplete=total['result'] is None,complete=orders_complete,adsComplete=ads_complete,adsPartial=bool(ad_products) and not ads_complete,
        products=list(by.values()),days=sorted(days.values(),key=lambda x:x['day']),events=sorted(events,key=lambda x:x['day'],reverse=True),campaigns=list(campaigns.values()),lossAfterShipping=None)


@panel.post('/sync')
def sync():
    u=web_identity()['id'];rate_limit('seller-sync:'+str(u),limit=30)
    seller=enqueue(u)
    if payload().get('retry'):
        with db() as cur:
            cur.execute("UPDATE seller_jobs SET state='queued',next_at=NOW(),error=NULL WHERE user_id=%s AND seller_id=%s AND state IN ('blocked','retry','unavailable')",(u,seller))
    return jsonify(queued=True),202


@panel.get('/status')
def status():
    u,s=scope()
    with db() as cur:return jsonify(progress(cur,u,s))


@panel.get('/snapshot')
def snapshot():
    u,s=scope();end=parse_day(request.args.get('end',today().isoformat()));start=parse_day(request.args.get('start',(end-timedelta(days=6)).isoformat()))
    if start>end or start<date(1999,1,1) or end>today():raise ApiError('invalid_date_range')
    with db() as cur:
        cur.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
        cur.execute("SET LOCAL statement_timeout='15000ms'")
        state=progress(cur,u,s)
        cur.execute('SELECT item_id,unit_cost,tax_percent FROM seller_costs WHERE user_id=%s AND seller_id=%s',(u,s));costs={r['item_id']:dict(cost=numeric(r['unit_cost']),tax=numeric(r['tax_percent'])) for r in cur.fetchall()}
        cur.execute('SELECT item_id,data FROM seller_products WHERE user_id=%s AND seller_id=%s ORDER BY item_id',(u,s));products=[product(r['item_id'],r['data'],costs) for r in cur.fetchall()]
        current=aggregate(cur,u,s,start,end,products,costs,state)
        previous_start=start-(end-start)-timedelta(days=1)
        previous=aggregate(cur,u,s,previous_start,start-timedelta(days=1),products,costs,state)
        cur.execute('SELECT id,name,category,amount,day,recurring FROM seller_expenses WHERE user_id=%s AND seller_id=%s',(u,s))
        expenses=[dict(id=str(r['id']),name=r['name'],category=r['category'],amount=float(r['amount']),date=r['day'].isoformat(),recurring=r['recurring']) for r in cur.fetchall()]
    return jsonify(start=start.isoformat(),end=end.isoformat(),previousStart=previous_start.isoformat(),current=current,previous=previous,progress=state,
        minDay=state['registeredOn'] or today().isoformat(),maxDay=today().isoformat(),expenses=expenses,costs=costs)


@panel.post('/cost')
def cost():
    u,s=scope();data=payload();key=data.get('itemId','')
    if not isinstance(key,str) or not ITEM.fullmatch(key):raise ApiError('invalid_item_id')
    def amount(name,maximum):
        v=data.get(name)
        if v is None:return None
        if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=maximum:raise ApiError('invalid_cost')
        return v
    unit=amount('unitCost',1000000);tax=amount('taxPercent',100)
    with db() as cur:
        cur.execute('SELECT 1 FROM seller_products WHERE user_id=%s AND seller_id=%s AND item_id=%s',(u,s,key))
        if not cur.fetchone():raise ApiError('item_not_found',404)
        cur.execute('INSERT INTO seller_costs(user_id,seller_id,item_id,unit_cost,tax_percent) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,item_id) DO UPDATE SET unit_cost=EXCLUDED.unit_cost,tax_percent=EXCLUDED.tax_percent,updated_at=NOW()',(u,s,key,unit,tax))
    return jsonify(ok=True)


@panel.post('/expenses')
def expenses():
    u,s=scope();data=payload();action=data.get('action','upsert')
    try:key=str(UUID(data.get('id'))) if data.get('id') else str(uuid4())
    except (ValueError,TypeError):raise ApiError('invalid_expense') from None
    with db() as cur:
        if action=='remove':cur.execute('DELETE FROM seller_expenses WHERE user_id=%s AND seller_id=%s AND id=%s',(u,s,key))
        elif action=='upsert':
            name=data.get('name');amount=data.get('amount');day=parse_day(data.get('date'));category=data.get('category');recurring=data.get('recurring',False)
            if not isinstance(name,str) or not 1<=len(name.strip())<=100 or category not in ('Estrutura','Serviços','Pessoal','Outros') or isinstance(amount,bool) or not isinstance(amount,(int,float)) or not math.isfinite(amount) or not 0<amount<=1000000 or day>today() or day<date(1999,1,1) or not isinstance(recurring,bool):raise ApiError('invalid_expense')
            cur.execute('INSERT INTO seller_expenses(user_id,seller_id,id,name,category,amount,day,recurring) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,amount=EXCLUDED.amount,day=EXCLUDED.day,recurring=EXCLUDED.recurring',(u,s,key,name.strip(),category,amount,day,recurring))
        else:raise ApiError('invalid_expense_action')
    return jsonify(ok=True,id=key)


@panel.post('/saved')
def saved():
    user=web_identity()['id']
    from saved_items import operate
    return jsonify(operate(user,payload()))

@panel.post('/connect')
def connect_account():
    from novai_billing import frontend
    from precify_api import create_oauth_ticket
    user=web_identity();rate_limit('seller-connect:'+str(user['id']),limit=10)
    return jsonify(url=create_oauth_ticket(user['id'],frontend()+'/dashboard/inicio'))
