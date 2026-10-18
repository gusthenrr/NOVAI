"""NOVAI browser sessions. Page identity is advisory; credentials stay server-side."""
import base64
import hashlib
import hmac
import os
import re
import secrets
from datetime import timedelta
from uuid import UUID, uuid4
from urllib.parse import urlencode

import bcrypt
import jwt
import psycopg2
import requests
from flask import Blueprint, current_app, jsonify, request, render_template, redirect
from precify_core import ApiError, db, digest, now, rate_limit
from security_auth import authenticate_password, validate_registration, account_requirements, TERMS_VERSION, PASSWORD_POLICY, valid_password
from precify_api import ml_token, public_base

extension = Blueprint('extension', __name__, url_prefix='/api/extension')
ACCESS='__Host-novai-ext-access'
REFRESH='__Host-novai-ext-refresh'
CSRF='__Host-novai-ext-csrf'
EXTENSION_ID='pfanhenbfblcbfldhpelnlmbheokjdlj'
ISSUER='novai-extension'
AUDIENCE='novai-extension-api'
WEEK=7*86400


def key():
    return current_app.config['JWT_SECRET_KEY']


def allowed_origin():
    origins={public_base(), 'chrome-extension://'+EXTENSION_ID}
    origins.update(x.strip() for x in os.environ.get('NOVAI_EXTENSION_ORIGINS','').split(',') if x.strip())
    return request.headers.get('Origin') in origins


def deny(reason='permission_denied'):
    raise ApiError(reason,403)


@extension.errorhandler(ApiError)
def error(e):
    if e.status in (401,403,404,409):
        current_app.logger.warning('extension_access status=403 reason=%s request_id=%s', e.code, getattr(request,'extension_request_id','-'))
        return jsonify(error='not_found'),404
    return jsonify(error='unavailable' if e.status>=500 else 'invalid_request'),e.status


@extension.before_request
def guard():
    request.extension_request_id=secrets.token_hex(8)
    if request.content_length and request.content_length>16384: raise ApiError('too_large',413)
    if request.method=='OPTIONS':
        if not allowed_origin(): deny('origin')
        return '',204
    if request.method=='POST':
        if not allowed_origin(): deny('origin')
        token=request.cookies.get(CSRF,'')
        if len(token)!=64 or not hmac.compare_digest(token,request.headers.get('X-CSRF-Token','')): deny('csrf')
    elif request.endpoint=='extension.csrf' and not allowed_origin() and request.headers.get('Sec-Fetch-Site')!='same-origin':
        deny('origin')


@extension.after_request
def headers(response):
    response.headers['Cache-Control']='no-store'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['X-Request-ID']=getattr(request,'extension_request_id','')
    if allowed_origin():
        response.headers['Access-Control-Allow-Origin']=request.headers['Origin']
        response.headers['Access-Control-Allow-Credentials']='true'
        response.headers['Access-Control-Allow-Headers']='Content-Type, X-CSRF-Token'
        response.headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'
        response.vary.add('Origin')
    return response


def cookie(response,name,value,age):
    response.set_cookie(name,value,max_age=max(0,int(age)),secure=True,httponly=True,samesite='None',path='/')


@extension.get('/csrf')
def csrf():
    token=request.cookies.get(CSRF)
    if not token or not re.fullmatch('[a-f0-9]{64}',token): token=secrets.token_hex(32)
    response=jsonify(csrf=token)
    cookie(response,CSRF,token,WEEK)
    return response


def body():
    data=request.get_json(silent=True)
    if not isinstance(data,dict): raise ApiError('invalid_json',400)
    return data


def refresh_value(sid,generation):
    signature=hmac.new(key().encode(),f'ext-refresh:{sid}:{generation}'.encode(),hashlib.sha256).hexdigest()
    return str(sid)+'.'+signature


def issue(response,row):
    timestamp=now()
    expiration=min(timestamp+timedelta(minutes=15),row['expires_at'])
    token=jwt.encode(dict(sub=str(row['user_id']),sid=str(row['id']),ver=row['auth_version'],
        iss=ISSUER,aud=AUDIENCE,iat=timestamp,exp=expiration),key(),algorithm='HS256')
    cookie(response,ACCESS,token,(expiration-timestamp).total_seconds())
    cookie(response,REFRESH,refresh_value(row['id'],row['generation']),(row['expires_at']-timestamp).total_seconds())
    return response


def new_session(cur,user):
    sid=str(uuid4())
    cur.execute("DELETE FROM extension_sessions WHERE expires_at<NOW()-INTERVAL '30 days'")
    cur.execute("DELETE FROM extension_used_refresh WHERE expires_at<NOW()")
    cur.execute('''INSERT INTO extension_sessions(id,user_id,auth_version,refresh_hash,expires_at)
      VALUES(%s,%s,%s,%s,%s) RETURNING *''',
      (sid,user['id'],user['auth_version'],digest(refresh_value(sid,0)),now()+timedelta(days=7)))
    return cur.fetchone()


def resolve(active=False):
    """Check DB revocation on every call; rotate under a row lock, never resurrect expiry."""
    supplied=request.cookies.get(REFRESH,'')
    if not re.fullmatch(r'[a-f0-9-]{36}\.[a-f0-9]{64}',supplied): deny('session')
    try: sid=str(UUID(supplied.split('.')[0]))
    except ValueError: deny('session')
    hashed=digest(supplied); failure=None; row=None
    with db() as cur:
        cur.execute('''SELECT s.*,u.auth_version AS current_version FROM extension_sessions s
          JOIN usuarios u ON u.id=s.user_id WHERE s.id=%s FOR UPDATE OF s''',(sid,))
        row=cur.fetchone()
        if not row or row['revoked_at'] or row['expires_at']<=now() or row['auth_version']!=row['current_version']:
            failure='session'
        elif hmac.compare_digest(row['refresh_hash'],hashed):
            # Read-only checks do not extend inactivity. User activity renews at most every 5 minutes.
            if active and row['last_active_at']<=now()-timedelta(minutes=5):
                cur.execute('DELETE FROM extension_used_refresh WHERE session_id=%s AND expires_at<NOW()',(sid,))
                cur.execute('INSERT INTO extension_used_refresh(token_hash,session_id) VALUES(%s,%s) ON CONFLICT DO NOTHING',(hashed,sid))
                cur.execute('''UPDATE extension_sessions SET generation=generation+1,previous_hash=refresh_hash,
                  refresh_hash=%s,rotated_at=NOW(),last_active_at=NOW(),expires_at=NOW()+INTERVAL '7 days'
                  WHERE id=%s RETURNING *''',(digest(refresh_value(sid,row['generation']+1)),sid))
                row=cur.fetchone()
        elif row['previous_hash'] and hmac.compare_digest(row['previous_hash'],hashed) and row['rotated_at']>now()-timedelta(seconds=30):
            pass # Parallel requests receive the same current cookie; no second rotation.
        else:
            cur.execute('SELECT 1 FROM extension_used_refresh WHERE token_hash=%s AND session_id=%s',(hashed,sid))
            if cur.fetchone():
                cur.execute('UPDATE extension_sessions SET revoked_at=NOW() WHERE id=%s',(sid,))
            failure='refresh_reuse'
    if failure: deny(failure)
    return row


def identity():
    try:
        claims=jwt.decode(request.cookies.get(ACCESS,''),key(),algorithms=['HS256'],audience=AUDIENCE,issuer=ISSUER,
                          options={'require':['sub','sid','ver','exp','iat']})
        with db() as cur:
            cur.execute('''SELECT s.* FROM extension_sessions s JOIN usuarios u ON u.id=s.user_id
              WHERE s.id=%s AND s.user_id=%s AND s.auth_version=%s AND u.auth_version=s.auth_version
              AND s.revoked_at IS NULL AND s.expires_at>NOW()''',(str(UUID(claims['sid'])),int(claims['sub']),claims['ver']))
            row=cur.fetchone()
        if not row: deny('session')
        return row
    except (jwt.InvalidTokenError,ValueError,TypeError,KeyError): deny('session')


def state(row,data=None):
    data=data or {}; ids=data.get('observedIds',[])
    if not isinstance(ids,list) or len(ids)>5 or any(not isinstance(i,str) or not re.fullmatch(r'\d{1,20}',i) for i in ids):
        raise ApiError('invalid_identity',400)
    with db() as cur:
        cur.execute('SELECT id_ml FROM contas_mercado_livre WHERE usuario_id=%s',(row['user_id'],))
        account=cur.fetchone(); requirements=account_requirements(cur,row['user_id'])
    matched='unknown' if not ids or not account else ('match' if str(account['id_ml']) in ids else 'mismatch')
    return dict(authenticated=True,expiresAt=int(min(now()+timedelta(minutes=15),row['expires_at']).timestamp()*1000),
        accountState=matched,linked=bool(account),accountRequirements=requirements)


@extension.post('/session')
def session():
    row=resolve();return issue(jsonify(state(row,body())),row)


@extension.post('/activity')
def activity():
    row=resolve(active=True);return issue(jsonify(state(row,body())),row)


@extension.post('/login')
def login():
    data=body(); user=authenticate_password(data.get('email'),data.get('password'))
    with db() as cur:
        cur.execute('SELECT id,auth_version FROM usuarios WHERE id=%s FOR UPDATE',(user['id'],))
        latest=cur.fetchone()
        if latest['auth_version']!=user['auth_version']: deny('credentials')
        # Replace this browser's prior session only if its refresh credential proves ownership.
        previous=request.cookies.get(REFRESH,'')
        cur.execute('UPDATE extension_sessions SET revoked_at=NOW() WHERE refresh_hash=%s',(digest(previous),))
        row=new_session(cur,latest)
    return issue(jsonify(state(row)),row)


@extension.post('/register')
def register():
    data=body(); email,name=validate_registration(data.get('email'),data.get('name'),data.get('password'))
    rate_limit('ext-register:'+str(request.remote_addr),20)
    if data.get('acceptedTerms') is not True or data.get('termsVersion')!=TERMS_VERSION: deny('terms')
    password=bcrypt.hashpw(data['password'].encode(),bcrypt.gensalt()).decode()
    try:
        with db() as cur:
            cur.execute('SELECT pg_advisory_xact_lock(%s)',(int(digest('register:'+email)[:15],16),))
            cur.execute('SELECT 1 FROM usuarios WHERE LOWER(email)=%s',(email,))
            if cur.fetchone(): deny('registration')
            cur.execute('INSERT INTO usuarios(usuario,email,senha,password_policy_version) VALUES(%s,%s,%s,%s) RETURNING id,auth_version',
                        (name,email,password,PASSWORD_POLICY))
            user=cur.fetchone()
            cur.execute('INSERT INTO precify_consents(user_id,purpose,version) VALUES(%s,%s,%s)',(user['id'],'precify_terms',TERMS_VERSION))
            row=new_session(cur,user)
    except psycopg2.errors.UniqueViolation: deny('registration')
    return issue(jsonify(state(row)),row),201


@extension.post('/logout')
def logout():
    row=resolve()
    with db() as cur: cur.execute('UPDATE extension_sessions SET revoked_at=NOW() WHERE id=%s',(row['id'],))
    response=jsonify(ok=True)
    for name in (ACCESS,REFRESH,CSRF): cookie(response,name,'',0)
    return response


@extension.post('/complete')
def complete():
    row=identity();data=body()
    with db() as cur:
        cur.execute('SELECT email FROM usuarios WHERE id=%s',(row['user_id'],));email=cur.fetchone()['email']
    user=authenticate_password(email,data.get('password'))
    if data.get('acceptedTerms') is not True or data.get('termsVersion')!=TERMS_VERSION: deny('terms')
    with db() as cur:
        if data.get('newPassword') is not None:
            if not valid_password(data['newPassword']): raise ApiError('invalid_password',400)
            cur.execute('UPDATE usuarios SET senha=%s,password_policy_version=%s,auth_version=auth_version+1 WHERE id=%s AND auth_version=%s RETURNING id,auth_version',
                (bcrypt.hashpw(data['newPassword'].encode(),bcrypt.gensalt()).decode(),PASSWORD_POLICY,user['id'],user['auth_version']))
            updated=cur.fetchone()
            if not updated: deny('credentials')
            cur.execute('UPDATE extension_sessions SET revoked_at=NOW() WHERE user_id=%s',(user['id'],))
            cur.execute('UPDATE precify_sessions SET revoked_at=NOW() WHERE user_id=%s',(user['id'],))
            row=new_session(cur,updated)
        cur.execute('INSERT INTO precify_consents(user_id,purpose,version) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(user['id'],'precify_terms',TERMS_VERSION))
    if data.get('newPassword') is not None:
        from precify_realtime import disconnect_account
        disconnect_account(user['id'])
    return issue(jsonify(state(row)),row)


@extension.post('/connect')
def connect():
    row=identity()
    from security_auth import require_ready
    require_ready(row['user_id'])
    if not os.environ.get('MERCADO_LIVRE_CLIENT_ID'): raise ApiError('unavailable',503)
    state_value='ext_'+secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48)
    with db() as cur:
        cur.execute('INSERT INTO extension_oauth(state_hash,session_id,verifier,expires_at) VALUES(%s,%s,%s,%s)',
                    (digest(state_value),row['id'],verifier,now()+timedelta(minutes=10)))
    challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
    return jsonify(url='https://auth.mercadolivre.com.br/authorization?'+urlencode(dict(response_type='code',
        client_id=os.environ['MERCADO_LIVRE_CLIENT_ID'],redirect_uri=os.environ.get('MERCADO_LIVRE_REDIRECT_URI',public_base()+'/callback'),
        state=state_value,code_challenge=challenge,code_challenge_method='S256')))


def oauth_callback():
    # Auth cookie binds the callback to the browser that initiated it. State is single use.
    try:
        session=resolve()
        with db() as cur:
            cur.execute('''UPDATE extension_oauth SET consumed_at=NOW() WHERE state_hash=%s AND session_id=%s
              AND expires_at>NOW() AND consumed_at IS NULL RETURNING verifier''',
              (digest(request.args.get('state','')),session['id']))
            row=cur.fetchone()
        if not row or not request.args.get('code'): deny('oauth')
        result=requests.post('https://api.mercadolibre.com/oauth/token',data=dict(grant_type='authorization_code',
            client_id=os.environ['MERCADO_LIVRE_CLIENT_ID'],client_secret=os.environ['MERCADO_LIVRE_CLIENT_SECRET'],
            redirect_uri=os.environ.get('MERCADO_LIVRE_REDIRECT_URI',public_base()+'/callback'),
            code=request.args['code'],code_verifier=row['verifier']),timeout=(3,15),allow_redirects=False)
        data=result.json()
        if not result.ok or not isinstance(data,dict) or not data.get('access_token') or not data.get('refresh_token') or not re.fullmatch(r'\d{1,20}',str(data.get('user_id',''))):
            raise ApiError('ml_unavailable',502)
        expires=now()+timedelta(seconds=int(data['expires_in']))
        with db() as cur:
            cur.execute('''SELECT s.id FROM extension_sessions s JOIN usuarios u ON u.id=s.user_id
              WHERE s.id=%s AND s.revoked_at IS NULL AND s.expires_at>NOW() AND s.auth_version=u.auth_version FOR UPDATE OF s''',(session['id'],))
            if not cur.fetchone(): deny('session')
            cur.execute('''INSERT INTO contas_mercado_livre(usuario_id,acess_token,refresh_token,expiracao_token,id_ml)
              VALUES(%s,%s,%s,%s,%s) ON CONFLICT(usuario_id) DO UPDATE SET acess_token=EXCLUDED.acess_token,
              refresh_token=EXCLUDED.refresh_token,expiracao_token=EXCLUDED.expiracao_token,id_ml=EXCLUDED.id_ml,updated_at=NOW()''',
              (session['user_id'],data['access_token'],data['refresh_token'],expires.replace(tzinfo=None),data['user_id']))
        response=redirect(public_base()+'/api/extension/account?connected=1')
        response.headers['Cache-Control']='no-store';response.headers['Referrer-Policy']='no-referrer'
        return response
    except ApiError as e: return error(e)
    except (requests.RequestException,ValueError,KeyError,TypeError): return jsonify(error='unavailable'),502


@extension.post('/connection')
def connection():
    row=identity()
    from security_auth import require_ready
    require_ready(row['user_id'])
    rate_limit('ext-connection:'+str(row['user_id']),30)
    try: ml_token(row['user_id']); result='ready'
    except ApiError as e:
        if e.code in ('ml_reconnect_required','ml_connection_required'): result='reconnect'
        else: raise
    return jsonify(connection=result)


def item_date_response(path, token, params=None):
    """Only fixed official resources; never log/forward upstream bodies or credentials."""
    try:
        with requests.get('https://api.mercadolibre.com'+path, params=params,
                headers={'Accept':'application/json','Authorization':'Bearer '+token},
                timeout=(3,5), allow_redirects=False) as response:
            status=response.status_code
            current_app.logger.info('extension_item_date upstream_status=%s request_id=%s',
                status,request.extension_request_id)
            if status in (401,403):
                current_app.logger.warning('extension_access status=403 reason=ml_date_denied request_id=%s',request.extension_request_id)
            if status!=200: return status,None
            if len(response.content)>1024*1024: return 502,None
            data=response.json()
            return (200,data) if isinstance(data,dict) else (502,None)
    except requests.Timeout:
        return 504,None
    except (requests.RequestException,ValueError):
        return 502,None


def valid_item_timestamp(value):
    from datetime import datetime, timezone
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})',value): return None
    try:
        date=datetime.fromisoformat(value.replace('Z','+00:00'))
        if date.tzinfo and datetime(2000,1,1,tzinfo=timezone.utc)<=date<=now()+timedelta(days=1): return value
    except ValueError: pass
    return None


@extension.post('/items/created-at')
def item_created_at():
    row=identity()
    from security_auth import require_ready
    require_ready(row['user_id'])
    item_id=body().get('item_id')
    if not isinstance(item_id,str) or not re.fullmatch(r'MLB\d{6,15}',item_id): raise ApiError('invalid_item_id',400)
    rate_limit('ext-item-date:'+str(row['user_id']),60)
    token=ml_token(row['user_id'])
    # Same order as Precify insights: actual listing first, then its description.
    status,data=item_date_response('/items/'+item_id,token,{'attributes':'id,date_created'})
    iso=valid_item_timestamp(data.get('date_created')) if data and data.get('id')==item_id else None
    if iso: return jsonify(itemId=item_id,createdAt={'iso':iso,'source':'ml_item'})
    if status==401: deny('ml_date_denied')
    if status==429: raise ApiError('ml_rate_limit',429)
    status,data=item_date_response('/items/'+item_id+'/description',token)
    if status in (401,403): deny('ml_date_denied')
    if status==429: raise ApiError('ml_rate_limit',429)
    if status not in (200,404): raise ApiError('ml_date_unavailable',502)
    iso=valid_item_timestamp(data.get('date_created')) if data else None
    return jsonify(itemId=item_id,createdAt={'iso':iso,'source':'ml_description'} if iso else None)


@extension.get('/account')
def account_page():
    nonce=secrets.token_urlsafe(18)
    response=current_app.make_response(render_template('extension_account.html',nonce=nonce,terms_version=TERMS_VERSION))
    response.headers['Content-Security-Policy']=f"default-src 'none'; style-src 'nonce-{nonce}'; script-src 'nonce-{nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response
