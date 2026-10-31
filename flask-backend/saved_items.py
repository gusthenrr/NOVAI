"""Account-owned shared saved products. Never accepts an owner from client JSON."""
import json
import math
import re
from urllib.parse import urlsplit, parse_qs, urlunsplit
from psycopg2.extras import Json
from precify_core import ApiError, db


def product_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ApiError('invalid_saved_item')
    try:
        u = urlsplit(value)
        if u.scheme != 'https' or u.username or u.password or u.port not in (None, 443) or not (u.hostname == 'mercadolivre.com.br' or u.hostname.endswith('.mercadolivre.com.br')):
            raise ValueError()
        query = parse_qs(u.query)
        offer = query.get('wid', [''])[0]
        match = re.search(r'\bMLB-?(\d{6,16})\b', offer or u.path, re.I)
        catalog = re.search(r'\bMLBU\d{6,16}\b', u.path, re.I)
        key = 'MLB'+match[1] if match else catalog[0].upper() if catalog else None
        if not key:
            raise ValueError()
        return key, urlunsplit(('https', u.netloc, u.path, 'wid='+key if offer else '', ''))
    except (ValueError, AttributeError):
        raise ApiError('invalid_saved_item') from None


def number(value, nullable=True):
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or abs(value) > 1e10:
        raise ApiError('invalid_saved_item')
    return value


def clean(data):
    if not isinstance(data, dict) or len(json.dumps(data)) > 24000:
        raise ApiError('invalid_saved_item')
    entry, item = data.get('entry'), data.get('item')
    if isinstance(entry, dict):
        product = entry.get('product', {})
        if not isinstance(product, dict): raise ApiError('invalid_saved_item')
        key, url = product_url(product.get('url'))
        name = product.get('name')
        price = number(product.get('price'), False)
        if price <= 0: raise ApiError('invalid_saved_item')
        form = entry.get('form', {})
        result = entry.get('result')
        if not isinstance(form, dict) or (result is not None and not isinstance(result, dict)): raise ApiError('invalid_saved_item')
        # Explicit public fields only. Credentials and arbitrary JSON are never persisted.
        public = {k: product[k] for k in ('itemId','imageUrl','sold','soldApproximate','createdAt','listingType','categoryId','sellerLocation') if k in product}
        public.update(name=name, price=price, currency='BRL', url=url, source='saved', fetchedAt=entry.get('visitedAt'))
        allowed_form = {k: form[k] for k in ('salePrice','productCost','tax','adType','reputation','shippingMode','freeShipping','shippingCost','category','shippingOverride','fastFreeShipping') if k in form}
        if isinstance(form.get('packaging'), dict): allowed_form['packaging'] = {k: form['packaging'][k] for k in ('name','weight','height','width','length','cost') if k in form['packaging']}
        result = {k: result[k] for k in ('frete','tarifas','impostos','custos','margemContribuicao','margemPct','missing','freteOrigem','freteTabelaVersao','avisos') if k in result} if result else None
        payload = dict(id=key,product=public,form=allowed_form,result=result,categoryName=str(entry.get('categoryName',''))[:500],saved=True,visitedAt=entry.get('visitedAt'))
        def decimal(v):
            try: return number(float(str(v).replace(',','.')))
            except (ValueError, TypeError): return None
        item = dict(itemId=key,url=url,name=name,image=public.get('imageUrl'),price=price,type='premium' if form.get('adType')=='Premium' else 'classic',cost=decimal(form.get('productCost')),other=decimal(form.get('packaging',{}).get('cost')),profit=(result or {}).get('margemContribuicao'),margin=(result or {}).get('margemPct'),shipping=(result or {}).get('frete'),fees=(result or {}).get('tarifas'),tax=(result or {}).get('impostos'))
    elif isinstance(item, dict):
        key, url = product_url(item.get('url') or 'https://produto.mercadolivre.com.br/MLB-'+str(item.get('itemId',''))[3:]+'-_JM')
        name = item.get('name')
        item = {k: item.get(k) for k in ('itemId','name','image','type','price','cost','other','profit','margin','shipping','fees','tax')}
        item.update(itemId=key,url=url)
        payload = None
    else:
        raise ApiError('invalid_saved_item')
    if not isinstance(name,str) or not name.strip() or number(item.get('price'),False) <= 0: raise ApiError('invalid_saved_item')
    item['name'] = name.strip()[:512]
    for field in ('cost','other','profit','margin','shipping','fees','tax'): item[field] = number(item.get(field))
    image = item.get('image')
    if image:
        u = urlsplit(str(image))
        if u.scheme != 'https' or u.username or u.password or not (u.hostname=='mlstatic.com' or (u.hostname or '').endswith('.mlstatic.com')): item['image']=None
    return key, url, item, payload


def operate(user_id, data):
    action = data.get('action', 'list')
    if action not in ('list','upsert','import','remove'): raise ApiError('invalid_saved_action')
    with db() as cur:
        expected = data.get('expectedAccount')
        if expected is not None:
            cur.execute('SELECT email FROM usuarios WHERE id=%s',(user_id,))
            owner=cur.fetchone()
            if not isinstance(expected,str) or not owner or expected.strip().lower()!=owner['email'].strip().lower():
                raise ApiError('saved_account_changed',409)
        # Serialize each account's writes, without locking other accounts.
        cur.execute('SELECT pg_advisory_xact_lock(%s)', (int(user_id),))
        if action == 'remove':
            key = data.get('key')
            if isinstance(key,str) and key.startswith('https://'): key=product_url(key)[0]
            if not isinstance(key,str) or not re.fullmatch(r'MLBU?\d{6,16}',key): raise ApiError('invalid_saved_item')
            cur.execute('UPDATE novai_saved_items SET deleted_at=NOW(),updated_at=NOW() WHERE user_id=%s AND item_key=%s',(user_id,key))
        elif action in ('upsert','import'):
            key,url,item,entry = clean(data)
            cur.execute('SELECT COUNT(*) AS total FROM novai_saved_items WHERE user_id=%s AND deleted_at IS NULL',(user_id,))
            if cur.fetchone()['total'] >= 200:
                cur.execute('SELECT 1 FROM novai_saved_items WHERE user_id=%s AND item_key=%s AND deleted_at IS NULL',(user_id,key))
                if not cur.fetchone(): raise ApiError('saved_limit',409)
            conflict = 'DO NOTHING' if action == 'import' else '''DO UPDATE SET url=EXCLUDED.url,extension_data=EXCLUDED.extension_data,
              app_data=EXCLUDED.app_data,deleted_at=NULL,updated_at=NOW()'''
            cur.execute('''INSERT INTO novai_saved_items(user_id,item_key,url,extension_data,app_data) VALUES(%s,%s,%s,%s,%s)
              ON CONFLICT(user_id,item_key) '''+conflict,(user_id,key,url,Json(item),Json(entry) if entry else None))
        cur.execute('SELECT item_key,url,extension_data,app_data,updated_at,deleted_at FROM novai_saved_items WHERE user_id=%s ORDER BY updated_at DESC',(user_id,))
        return dict(items=[dict(key=r['item_key'],url=r['url'],item=r['extension_data'],entry=r['app_data'],updatedAt=int(r['updated_at'].timestamp()*1000),deleted=bool(r['deleted_at'])) for r in cur.fetchall()])
