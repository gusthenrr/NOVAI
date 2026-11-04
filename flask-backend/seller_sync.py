"""Durable monthly backfill. Small resumable slices, newest month first, no login blocking."""
import calendar
import re
import time
from datetime import date, datetime, timedelta
from uuid import uuid4
from psycopg2.extras import Json
from flask import current_app
from precify_core import ApiError, db, now, BR
from seller_ml import get

ITEM=re.compile(r'MLB\d{6,16}\Z')
METRICS='clicks,prints,cost,direct_amount,indirect_amount,direct_units_quantity,indirect_units_quantity'


def today(): return now().astimezone(BR).date()
def month_end(d): return d.replace(day=calendar.monthrange(d.year,d.month)[1])
def month_before(d): return (d.replace(day=1)-timedelta(days=1)).replace(day=1)
def money(v):
    try:
        n=float(v)
        return round(n,2) if abs(n)<1e15 else None
    except (TypeError,ValueError): return None


def connection(user):
    with db() as cur:
        cur.execute('SELECT id_ml FROM contas_mercado_livre WHERE usuario_id=%s',(user,))
        row=cur.fetchone()
    if not row or not row['id_ml']: raise ApiError('ml_connection_required',409)
    return int(row['id_ml'])


def enqueue(user):
    seller=connection(user)
    with db() as cur:
        cur.execute('INSERT INTO seller_sync(user_id,seller_id) VALUES(%s,%s) ON CONFLICT(user_id,seller_id) DO UPDATE SET touched_at=NOW()', (user,seller))
        cur.execute("INSERT INTO seller_jobs(user_id,seller_id,kind,period) VALUES(%s,%s,'profile',%s) ON CONFLICT DO NOTHING",(user,seller,today().replace(day=1)))
    return seller


def put_product(cur,user,seller,item):
    key=item.get('id')
    if not isinstance(key,str) or not ITEM.fullmatch(key): return
    if item.get('seller_id') not in (None,seller): raise ApiError('ml_owner_mismatch',502)
    # Explicit allowlist; no buyer, address, message or credential data is kept.
    attrs=item.get('attributes') or []
    value={k:item.get(k) for k in ('title','price','available_quantity','status','date_created','catalog_listing','listing_type_id','category_id','category_name','permalink','secure_thumbnail')}
    value['sku']=item.get('seller_custom_field') or next((a.get('value_name') for a in attrs if a.get('id')=='SELLER_SKU'),'')
    value['logistic_type']=(item.get('shipping') or {}).get('logistic_type') or item.get('logistic_type')
    value={k:v for k,v in value.items() if v is not None}
    image=value.get('secure_thumbnail')
    if image and not re.match(r'^https://(?:[a-zA-Z0-9-]+\.)*mlstatic\.com/',image):value.pop('secure_thumbnail',None)
    cur.execute('INSERT INTO seller_products(user_id,seller_id,item_id,data) VALUES(%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,item_id) DO UPDATE SET data=seller_products.data || EXCLUDED.data,fetched_at=NOW()', (user,seller,key,Json(value)))


def clean_order(order,seller):
    if (order.get('seller') or {}).get('id')!=seller: raise ApiError('ml_owner_mismatch',502)
    if order.get('currency_id')!='BRL': raise ApiError('unsupported_seller_currency',409)
    try:
        day=datetime.fromisoformat(order['date_created'].replace('Z','+00:00')).astimezone(BR).date()
        identifier=str(int(order['id']))
    except (KeyError,TypeError,ValueError): raise ApiError('ml_invalid_order',502) from None
    lines=[]
    for row in order.get('order_items',[]):
        item=row.get('item') or {};key=item.get('id','')
        if not ITEM.fullmatch(key): raise ApiError('ml_invalid_order',502)
        quantity=money(row.get('quantity'));price=money(row.get('unit_price'))
        if quantity is None or quantity<=0 or price is None: raise ApiError('ml_invalid_order',502)
        lines.append(dict(id=key,title=str(item.get('title') or key)[:512],quantity=quantity,price=price,fee=money(row.get('sale_fee'))))
    if not lines: raise ApiError('ml_invalid_order',502)
    payments=order.get('payments') or []
    # Never add both a cancelled order and its refund as two revenue losses.
    refunds=[money(p.get('transaction_amount_refunded')) for p in payments if p.get('status') in ('approved','refunded','in_mediation','charged_back')]
    refund=None if not refunds or any(v is None for v in refunds) else round(sum(refunds),2)
    if any(p.get('status')=='charged_back' for p in payments): refund=None
    return identifier,day,dict(status=order.get('status'),lines=lines,refunded=refund,shipment=str((order.get('shipping') or {}).get('id') or '') or None)


def step(job):
    u,s=job['user_id'],job['seller_id'];cursor=job['cursor'] or {};period=job['period'];kind=job['kind']
    fetch=lambda path,params=None: get(u,s,path,params,{'api-version':'2','x-format-new':'true'})
    if kind=='profile':
        profile=fetch('/users/'+str(s))
        if profile.get('id')!=s: raise ApiError('ml_owner_mismatch',502)
        registered=date.fromisoformat(profile['registration_date'][:10]);end=today()
        # ML search retention: 12 months; existing local facts are never deleted.
        try: retention=end.replace(year=end.year-1)
        except ValueError: retention=end.replace(year=end.year-1,day=28)
        first=max(registered,retention)
        with db() as cur:
            cur.execute('UPDATE seller_sync SET nickname=%s,reputation=%s,registered_on=%s,available_from=%s,initialized=TRUE,revision=revision+1 WHERE user_id=%s AND seller_id=%s',(profile.get('nickname'),(profile.get('seller_reputation') or {}).get('level_id'),registered,first,u,s))
            for typ in ('catalog',):
                cur.execute('INSERT INTO seller_jobs(user_id,seller_id,kind,period) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(u,s,typ,end.replace(day=1)))
            month=end.replace(day=1)
            while month>=first.replace(day=1):
                for typ in ('orders','ads'):
                    cur.execute('INSERT INTO seller_jobs(user_id,seller_id,kind,period) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(u,s,typ,month))
                month=month_before(month)
        return {},True,None
    if kind=='catalog':
        params={'search_type':'scan','limit':20}
        if cursor.get('scroll'):params['scroll_id']=cursor['scroll']
        data=fetch('/users/'+str(s)+'/items/search',params);ids=data.get('results')
        if not isinstance(ids,list) or any(not isinstance(x,str) or not ITEM.fullmatch(x) for x in ids): raise ApiError('ml_invalid_catalog',502)
        if ids:
            batch=fetch('/items',{'ids':','.join(ids)})
            if not isinstance(batch,list) or any(x.get('code')!=200 for x in batch):raise ApiError('ml_incomplete_catalog',502)
            categories=cursor.get('categories',{})
            for row in batch:
                category=row['body'].get('category_id')
                if category and category not in categories:
                    try:categories[category]=fetch('/categories/'+category).get('name')
                    except ApiError as exc:
                        if exc.status not in (403,404):raise
                row['body']['category_name']=categories.get(category)
            with db() as cur:
                for row in batch: put_product(cur,u,s,row['body'])
                cur.execute('UPDATE seller_sync SET revision=revision+1 WHERE user_id=%s AND seller_id=%s',(u,s))
        if not ids:return {},True,None
        if not data.get('scroll_id'):raise ApiError('ml_incomplete_catalog',502)
        return {'scroll':data['scroll_id'],'categories':categories},False,None
    if kind=='orders':
        with db() as cur:
            cur.execute('SELECT available_from FROM seller_sync WHERE user_id=%s AND seller_id=%s',(u,s));first=cur.fetchone()['available_from']
        start=max(period,first);end=min(month_end(period),today())
        if start>end:return {},True,None if job.get('finished_at') and not job.get('error') else 'orders_retention_12_months'
        with db() as cur:
            cur.execute('UPDATE seller_jobs SET coverage_from=COALESCE(coverage_from,%s) WHERE id=%s',(start,job['id']))
        # Inclusive millisecond ranges. Split dense windows before hitting ML's 10k cap.
        windows=cursor.get('windows') or [[start.isoformat()+'T00:00:00.000-03:00',end.isoformat()+'T23:59:59.999-03:00']]
        lo,hi=windows[0];offset=cursor.get('offset',0);index=cursor.get('index',0)
        data=fetch('/orders/search',{'seller':s,'order.date_created.from':lo,'order.date_created.to':hi,'sort':'date_asc','order.status':'paid,partially_refunded,cancelled','limit':50,'offset':offset})
        rows=data.get('results');total=(data.get('paging') or {}).get('total')
        if not isinstance(rows,list) or not isinstance(total,int): raise ApiError('ml_invalid_orders',502)
        if total>=9950:
            a=datetime.fromisoformat(lo);b=datetime.fromisoformat(hi)
            if (b-a).total_seconds()<1:raise ApiError('ml_pagination_limit',409)
            mid=a+(b-a)/2;mid=mid.replace(microsecond=(mid.microsecond//1000)*1000)
            windows[:1]=[[lo,mid.isoformat(timespec='milliseconds')],[(mid+timedelta(milliseconds=1)).isoformat(timespec='milliseconds'),hi]]
            return {'windows':windows},False,None
        if not rows and offset<total:raise ApiError('ml_incomplete_orders',502)
        # Five enriched orders per durable slice: failures do not discard previous pages.
        for order in rows[index:index+5]:
            identifier,day,facts=clean_order(order,s)
            with db() as cur:
                for line in facts['lines']:
                    cur.execute('INSERT INTO seller_products(user_id,seller_id,item_id,data) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING',(u,s,line['id'],Json({'title':line['title']})))
                cur.execute('INSERT INTO seller_orders(user_id,seller_id,order_id,day,shipment_id,data) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,order_id) DO UPDATE SET day=EXCLUDED.day,shipment_id=EXCLUDED.shipment_id,data=EXCLUDED.data,updated_at=NOW()', (u,s,identifier,day,facts['shipment'],Json(facts)))
            shipment=facts['shipment']
            if shipment:
                with db() as cur:
                    cur.execute('SELECT status FROM seller_shipping WHERE user_id=%s AND seller_id=%s AND shipment_id=%s',(u,s,shipment));known=cur.fetchone()
                if not known or known['status']!='ready':
                    cost=None;units=None;status='unavailable'
                    try:
                        shipping=fetch('/shipments/'+shipment+'/costs')
                        matching=[p for p in shipping.get('senders',[]) if p.get('user_id')==s]
                        items=fetch('/shipments/'+shipment+'/items')
                        if matching and isinstance(items,list):
                            vals=[money(p.get('cost')) for p in matching]
                            units=sum(float(p.get('quantity',0)) for p in items if p.get('sender_id')==s)
                            if all(v is not None for v in vals) and units>0:cost=round(sum(vals),2);status='ready'
                    except ApiError as exc:
                        if exc.status not in (403,404):raise
                    with db() as cur:
                        cur.execute('INSERT INTO seller_shipping(user_id,seller_id,shipment_id,cost,units,status) VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,shipment_id) DO UPDATE SET cost=EXCLUDED.cost,units=EXCLUDED.units,status=EXCLUDED.status',(u,s,shipment,cost,units,status))
            index+=1
        if index>=len(rows):offset+=len(rows);index=0
        if offset>=total:
            windows.pop(0);offset=0;index=0
            if not windows:return {},True,None
        return {'windows':windows,'offset':offset,'index':index},False,None
    if kind=='ads':
        # Ads retention is 90 days, independently of the orders retention.
        if month_end(period)<today()-timedelta(days=89):return {},True,None if job.get('finished_at') and job.get('error') not in ('ads_retention_90_days',) else 'ads_retention_90_days'
        day=date.fromisoformat(cursor['day']) if cursor.get('day') else max(period,today()-timedelta(days=89))
        end=min(month_end(period),today())
        with db() as cur:
            cur.execute('UPDATE seller_jobs SET coverage_from=COALESCE(coverage_from,%s) WHERE id=%s',(day,job['id']))
        if not cursor.get('advertiser'):
            data=get(u,s,'/advertising/advertisers',{'product_id':'PADS'},{'api-version':'1'})
            advertisers=data.get('advertisers',[]) if isinstance(data,dict) else []
            eligible=[a for a in advertisers if a.get('site_id')=='MLB']
            advertiser=eligible[0] if eligible else None
            if not advertiser:
                # No advertiser is a verified absence, not an HTTP permission failure.
                return {},True,'no_ads_account'
            cursor['advertisers']=[a['advertiser_id'] for a in eligible];cursor['advertiser']=advertiser['advertiser_id'];cursor['advertiser_index']=0
        base='/advertising/MLB/advertisers/'+str(cursor['advertiser'])+'/product_ads'
        # Persist group inventory in the cursor once; only public IDs/names are stored.
        if 'groups' not in cursor:
            groups=[];offset=cursor.get('group_offset',0)
            response=fetch(base+'/ad_groups/search',{'limit':50,'offset':offset})
            rows=response.get('results')
            if not isinstance(rows,list):raise ApiError('ml_invalid_ads',502)
            groups=cursor.get('group_buffer',[])+[{'id':r['id'],'campaign':r['campaign_id']} for r in rows]
            total=int(response.get('paging',{}).get('total',len(rows)))
            if offset+len(rows)<total:
                if not rows or offset+len(rows)>=10000:raise ApiError('ml_ads_pagination_limit',409)
                return {**cursor,'group_buffer':groups,'group_offset':offset+len(rows)},False,None
            next_advertiser=cursor.get('advertiser_index',0)+1
            if next_advertiser<len(cursor.get('advertisers',[])):
                return {**cursor,'group_buffer':groups,'group_offset':0,'advertiser_index':next_advertiser,'advertiser':cursor['advertisers'][next_advertiser]},False,None
            cursor={**cursor,'groups':list({str(g['id']):g for g in groups}.values())};cursor.pop('group_buffer',None);cursor.pop('group_offset',None)
        groups=cursor['groups'];idx=cursor.get('group_index',0);offset=cursor.get('offset',0)
        if not groups:return {},True,'no_ads_account'
        group=groups[idx];campaign=str(group['campaign']);names=cursor.get('names',{})
        if campaign not in names:
            meta=fetch('/advertising/MLB/product_ads/campaigns/'+campaign)
            names[campaign]=str(meta.get('name') or campaign);cursor['names']=names
        response=fetch('/advertising/MLB/product_ads/ad_groups/'+str(group['id'])+'/ads',{'date_from':day.isoformat(),'date_to':day.isoformat(),'metrics':METRICS,'limit':50,'offset':offset})
        rows=response.get('results');total=response.get('paging',{}).get('total')
        if not isinstance(rows,list) or not isinstance(total,int):raise ApiError('ml_invalid_ads',502)
        own_rows=[]
        for row in rows:
            key=row.get('item_id','')
            if not ITEM.fullmatch(key):raise ApiError('ml_invalid_ads',502)
            with db() as cur:
                cur.execute('SELECT 1 FROM seller_products WHERE user_id=%s AND seller_id=%s AND item_id=%s',(u,s,key));known=cur.fetchone()
            if not known:
                item=fetch('/items/'+key)
                if item.get('seller_id')!=s:continue
                with db() as cur:put_product(cur,u,s,item)
            own_rows.append(row)
        with db() as cur:
            for row in own_rows:
                key=row.get('item_id','')
                if not ITEM.fullmatch(key):raise ApiError('ml_invalid_ads',502)
                metrics=row.get('metrics') or {}
                values={k:money(metrics.get(k)) for k in METRICS.split(',')}
                cur.execute('INSERT INTO seller_ads(user_id,seller_id,day,campaign_id,campaign_name,ad_group_id,item_id,data) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(user_id,seller_id,day,ad_group_id,item_id) DO UPDATE SET data=EXCLUDED.data,campaign_id=EXCLUDED.campaign_id,campaign_name=EXCLUDED.campaign_name',(u,s,day,campaign,names[campaign],str(group['id']),key,Json(values)))
                put_product(cur,u,s,dict(row,id=key))
        offset+=len(rows)
        if offset<total:
            if not rows or offset>=10000:raise ApiError('ml_ads_pagination_limit',409)
        else:idx+=1;offset=0
        if idx>=len(groups):day+=timedelta(days=1);idx=0
        if day>end:return {},True,None
        return {**cursor,'day':day.isoformat(),'group_index':idx,'offset':offset},False,None
    raise ApiError('invalid_sync_kind')


def run_once():
    lease=str(uuid4())
    with db() as cur:
        # One lease per account, recover automatically after crashes. Network never holds a DB lock.
        cur.execute("""WITH due AS (
          SELECT j.id FROM seller_jobs j JOIN contas_mercado_livre c ON c.usuario_id=j.user_id AND c.id_ml=j.seller_id
          WHERE j.state IN ('queued','retry','running','done') AND j.next_at<=NOW()
          AND (j.lease_until IS NULL OR j.lease_until<NOW())
          AND NOT EXISTS(SELECT 1 FROM seller_jobs x WHERE x.user_id=j.user_id AND x.lease_until>NOW())
          ORDER BY CASE WHEN j.kind='profile' THEN 0 WHEN j.state='done' THEN 3 ELSE 1 END,
          j.period DESC,CASE j.kind WHEN 'orders' THEN 0 WHEN 'catalog' THEN 1 ELSE 2 END
          FOR UPDATE OF j SKIP LOCKED LIMIT 1)
          UPDATE seller_jobs j SET state='running',lease=%s,lease_until=NOW()+INTERVAL '15 minutes'
          FROM due WHERE j.id=due.id RETURNING j.*""",(lease,));job=cur.fetchone()
    if not job:return False
    try:
        cursor,done,warning=step(job)
        # Completed jobs refresh periodically. History stays saved; only cursor resets.
        refresh=1800 if job['period']>=month_before(today()) else 86400
        if warning in ('ads_retention_90_days','no_ads_account'): refresh=86400
        with db() as cur:
            cur.execute("""UPDATE seller_jobs SET cursor=%s,state=%s,error=%s,attempts=0,lease=NULL,lease_until=NULL,
              finished_at=CASE WHEN %s THEN NOW() ELSE finished_at END,next_at=NOW()+(%s*INTERVAL '1 second')
              WHERE id=%s AND lease=%s""",(Json(cursor),'done' if done else 'queued',warning,done,refresh if done else 0,job['id'],lease))
            if done:
                cur.execute('UPDATE seller_sync SET revision=revision+1 WHERE user_id=%s AND seller_id=%s',(job['user_id'],job['seller_id']))
    except Exception as exc:
        code=exc.code if isinstance(exc,ApiError) else 'sync_unavailable'
        if job['kind']=='catalog' and code=='ml_http_400':
            with db() as cur:cur.execute("UPDATE seller_jobs SET cursor='{}' WHERE id=%s AND lease=%s",(job['id'],lease))
        terminal=code in ('ml_account_changed','ml_reconnect_required','ml_connection_required','ml_owner_mismatch','unsupported_seller_currency')
        # Optional Ads permission failures do not stop order backfill.
        unavailable=job['kind']=='ads' and isinstance(exc,ApiError) and exc.status in (403,404)
        with db() as cur:
            cur.execute("""UPDATE seller_jobs SET state=%s,error=%s,attempts=attempts+1,lease=NULL,lease_until=NULL,
              next_at=NOW()+(%s*INTERVAL '1 second') WHERE id=%s AND lease=%s""",('blocked' if terminal else 'unavailable' if unavailable else 'retry',code,min(3600,30*2**min(job['attempts'],7)),job['id'],lease))
        current_app.logger.warning('seller_sync job=%s kind=%s error=%s',job['id'],job['kind'],code)
    return True


def start(app):
    if app.testing:return
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler=BackgroundScheduler(daemon=True)
    def tick():
        with app.app_context():
            try:run_once()
            except Exception:app.logger.warning('seller_sync worker unavailable')
    scheduler.add_job(tick,'interval',seconds=2,max_instances=1,coalesce=True)
    scheduler.start();app.extensions['seller_sync']=scheduler
