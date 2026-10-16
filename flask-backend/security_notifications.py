"""Notifications are untrusted hints; only official, account-owned data is used."""
import json
import os
import re
from flask import jsonify, request
from precify_core import ApiError, db, digest, rate_limit
from security_network import official_resource_url, ml_http, TOPICS


def owned_resource(data,topic,seller):
    if not isinstance(data,dict): return False
    if topic=='messages' and isinstance(data.get('messages'),list):
        return bool(data['messages']) and all(owned_resource(m,topic,seller) for m in data['messages'])
    ids=[data.get('seller_id')]
    keys=('from',) if topic=='messages' else ('seller',)
    for key in keys:
        value=data.get(key)
        if isinstance(value,dict): ids.extend([value.get('id'),value.get('user_id')])
    if topic=='messages':
        recipients=data.get('to',[])
        if isinstance(recipients,dict): recipients=[recipients]
        for value in recipients if isinstance(recipients,list) else []:
            if isinstance(value,dict): ids.extend([value.get('user_id'),value.get('id')])
    if topic=='post_purchase':
        for value in data.get('players',[]) if isinstance(data.get('players'),list) else []:
            if isinstance(value,dict) and value.get('role') in ('respondent','seller'):
                ids.append(value.get('user_id'))
    return str(seller) in {str(x) for x in ids if x is not None}


def receive_notification(socketio,handler):
    data=request.get_json(silent=True)
    if not isinstance(data,dict): raise ApiError('invalid_notification')
    seller=data.get('user_id')
    if isinstance(seller,bool) or not re.fullmatch(r'[0-9]{1,20}',str(seller or '')): raise ApiError('invalid_notification')
    topic=data.get('topic');resource=data.get('resource')
    if not isinstance(topic,str) or topic not in TOPICS: raise ApiError('invalid_notification_topic')
    url=official_resource_url(resource,topic)
    app_id=os.environ.get('MERCADO_LIVRE_CLIENT_ID')
    if app_id and str(data.get('application_id',''))!=app_id: raise ApiError('invalid_notification_application')
    with db() as cur:
        cur.execute('SELECT usuario_id,acess_token FROM contas_mercado_livre WHERE id_ml=%s',(str(seller),))
        owner=cur.fetchone()
    if not owner: return jsonify(status='ignored'),202
    rate_limit('ml-notification:'+str(owner['usuario_id']),limit=600)
    from precify_api import ml_token
    token=ml_token(owner['usuario_id'])
    # Resource validators guarantee the fixed API host even for malformed inputs.
    response=ml_http.get(url,params={'tag':'post_sale'} if topic=='messages' else None,headers={'Authorization':'Bearer '+token})
    if response.status_code!=200: raise ApiError('notification_resource_unavailable',503)
    try: verified=response.json()
    except ValueError: raise ApiError('invalid_notification_response',502) from None
    if topic=='public_offers' and isinstance(verified,dict) and re.fullmatch(r'MLB\d{6,15}',str(verified.get('item_id',''))):
        item=ml_http.get(official_resource_url('/items/'+verified['item_id']),headers={'Authorization':'Bearer '+token})
        if item.status_code!=200: raise ApiError('notification_resource_unavailable',503)
        verified=item.json()
    if not owned_resource(verified,topic,seller): return jsonify(status='ignored'),202
    # Dedupe only verified notifications; arbitrary failed hints cannot poison a key.
    key=digest(json.dumps([str(seller),topic,resource,data.get('sent') or data.get('_id')],sort_keys=True))
    with db() as cur:
        cur.execute('DELETE FROM novai_notification_receipts WHERE received_at<NOW()-INTERVAL \'7 days\'')
        cur.execute('INSERT INTO novai_notification_receipts(key_hash) VALUES(%s) ON CONFLICT DO NOTHING RETURNING key_hash',(key,))
        if not cur.fetchone(): return jsonify(status='duplicate'),200
    resource=url.split('api.mercadolibre.com',1)[1]
    if topic=='messages': resource=resource.removeprefix('/messages/')
    clean={'user_id':int(seller),'topic':topic,'resource':resource,'application_id':data.get('application_id')}
    socketio.start_background_task(handler,clean,owner['usuario_id'])
    return jsonify(status='ok'),200
