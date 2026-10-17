"""Precify v2 API. ML credentials never leave NOVAI for these app sessions."""
import base64
from datetime import timedelta
import hashlib
import os
import re
import secrets
from urllib.parse import urlencode, urlsplit

import bcrypt
from flask import Blueprint, current_app, jsonify, redirect, request, render_template
import psycopg2
import requests

from precify_core import ApiError, UTC, account, check_import, db, digest, identity, new_session, now, plan_for, rate_limit, require_feature, reserve_import
from pricing_margin import UpstreamError, get_ml
from security_auth import authenticate_password, validate_registration, account_requirements, valid_password, PASSWORD_POLICY

precify = Blueprint('precify', __name__, url_prefix='/api/precify', template_folder='templates')
ITEM = re.compile(r'MLB\d{6,15}\Z')
TERMS_VERSION='2026-10-15'


def public_base():
    return os.environ.get('PUBLIC_BASE_URL','https://novai-production-0d2f.up.railway.app').rstrip('/')


@precify.errorhandler(ApiError)
def api_error(error):
    return jsonify(error=error.code),error.status


@precify.before_request
def limits():
    if request.content_length and request.content_length>32768:
        raise ApiError('request_too_large',413)


@precify.after_request
def private_response(response):
    response.headers['Cache-Control']='no-store'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['X-Content-Type-Options']='nosniff'
    return response


def body():
    data=request.get_json(silent=True)
    if not isinstance(data,dict):
        raise ApiError('invalid_json')
    return data


def session_data(user,token=None):
    with db() as cur:
        cur.execute('SELECT id,id_ml FROM contas_mercado_livre WHERE usuario_id=%s',(user['id'],))
        linked_account=cur.fetchone()
        linked=bool(linked_account)
        cur.execute('SELECT email_verified_at FROM usuarios WHERE id=%s',(user['id'],))
        email_verified=bool(cur.fetchone()['email_verified_at'])
        result=dict(emailVerified=email_verified,user=dict(id=str(user['id']),email=user['email'],name=user['usuario']),linked=linked,sellerId=str(linked_account['id_ml']) if linked_account else None,plan=plan_for(cur,user['id']),accountRequirements=account_requirements(cur,user['id']))
    if token:
        result['sessionToken']=token
    return result


@precify.post('/auth/login')
def login():
    data=body()
    user=authenticate_password(data.get('email'),data.get('password'))
    with db() as cur:
        cur.execute('SELECT auth_version FROM usuarios WHERE id=%s FOR UPDATE',(user['id'],))
        if cur.fetchone()['auth_version']!=user['auth_version']: raise ApiError('invalid_credentials',401)
        token=new_session(cur,user['id'])
    return jsonify(session_data(user,token))


@precify.post('/auth/register')
def register():
    data=body()
    email=str(data.get('email','')).strip().lower()
    name=str(data.get('name','')).strip()
    password=data.get('password')
    email,name=validate_registration(email,name,password)
    rate_limit('register-email:'+email)
    if data.get('acceptedTerms') is not True or data.get('termsVersion')!=TERMS_VERSION:
        raise ApiError('terms_required')
    # Use the same NOVAI account table and password format as the existing signup.
    try:
        with db() as cur:
            cur.execute('SELECT pg_advisory_xact_lock(%s)',(int(digest('register:'+email)[:15],16),))
            cur.execute('SELECT id FROM usuarios WHERE LOWER(email)=%s',(email,))
            if cur.fetchone():
                raise ApiError('email_in_use',409)
            cur.execute('INSERT INTO usuarios(usuario,email,senha,password_policy_version) VALUES(%s,%s,%s,%s) RETURNING id,email,usuario',
                        (name,email,bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode(),PASSWORD_POLICY))
            user=cur.fetchone()
            cur.execute('INSERT INTO precify_consents(user_id,purpose,version) VALUES(%s,%s,%s)',(user['id'],'precify_terms',TERMS_VERSION))
            token=new_session(cur,user['id'])
    except psycopg2.errors.UniqueViolation:
        raise ApiError('email_in_use',409) from None
    return jsonify(session_data(user,token)),201


@precify.get('/session')
def session():
    return jsonify(session_data(identity(allow_incomplete=True)))


@precify.post('/auth/logout')
def logout():
    identity(allow_incomplete=True)
    with db() as cur:
        cur.execute('UPDATE precify_sessions SET revoked_at=NOW() WHERE token_hash=%s',(digest(request.headers['X-Precify-Session']),))
    from precify_realtime import disconnect_session
    disconnect_session(digest(request.headers['X-Precify-Session']))
    return jsonify(ok=True)


@precify.post('/auth/complete')
def complete_account():
    user=identity(allow_incomplete=True)
    data=body()
    with db() as cur: needed=account_requirements(cur,user['id'])
    if needed['needsTerms'] and (data.get('acceptedTerms') is not True or data.get('termsVersion')!=TERMS_VERSION):
        raise ApiError('terms_required')
    if needed['needsPasswordUpdate'] or data.get('newPassword') is not None:
        verified=authenticate_password(user['email'],data.get('currentPassword'))
        if not valid_password(data.get('newPassword')): raise ApiError('invalid_password')
        with db() as cur:
            cur.execute('UPDATE usuarios SET senha=%s,password_policy_version=%s,auth_version=auth_version+1 WHERE id=%s AND auth_version=%s',
                (bcrypt.hashpw(data['newPassword'].encode(),bcrypt.gensalt()).decode(),PASSWORD_POLICY,user['id'],verified['auth_version']))
            if not cur.rowcount: raise ApiError('invalid_credentials',401)
            cur.execute('UPDATE precify_sessions SET revoked_at=NOW() WHERE user_id=%s AND token_hash<>%s',(user['id'],digest(request.headers['X-Precify-Session'])))
        from precify_realtime import disconnect_account
        disconnect_account(user['id'],keep_session=digest(request.headers['X-Precify-Session']))
    if data.get('acceptedTerms') is True and data.get('termsVersion')==TERMS_VERSION:
        with db() as cur:
            cur.execute('INSERT INTO precify_consents(user_id,purpose,version) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING',(user['id'],'precify_terms',TERMS_VERSION))
    return jsonify(session_data(user))


@precify.get('/auth/sessions')
def device_sessions():
    user=identity()
    with db() as cur:
        cur.execute('SELECT token_hash,created_at,expires_at FROM precify_sessions WHERE user_id=%s AND revoked_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC',(user['id'],))
        rows=cur.fetchall()
    current=digest(request.headers['X-Precify-Session'])
    return jsonify(sessions=[dict(id=r['token_hash'],current=r['token_hash']==current,createdAt=r['created_at'].isoformat(),expiresAt=r['expires_at'].isoformat()) for r in rows])


@precify.post('/auth/sessions/revoke')
def revoke_device():
    user=identity();identifier=body().get('id')
    if not isinstance(identifier,str) or not re.fullmatch(r'[0-9a-f]{64}',identifier): raise ApiError('invalid_session')
    with db() as cur:
        cur.execute('UPDATE precify_sessions SET revoked_at=NOW() WHERE user_id=%s AND token_hash=%s RETURNING token_hash',(user['id'],identifier))
        if not cur.fetchone(): raise ApiError('session_not_found',404)
    from precify_realtime import disconnect_session
    disconnect_session(identifier)
    return jsonify(ok=True)


@precify.post('/realtime/ticket')
def realtime_ticket():
    from precify_realtime import ticket
    return jsonify(ticket())


@precify.get('/seller-profile')
def seller_profile():
    user = identity()
    with db() as cur:
        cur.execute("""SELECT p.seller_id,p.level_id,p.reputation FROM precify_seller_profiles p
          JOIN contas_mercado_livre c ON c.usuario_id=p.user_id AND c.id_ml::text=p.seller_id
          WHERE p.user_id=%s AND p.fetched_at>NOW()-INTERVAL '1 hour'""", (user['id'],))
        cached = cur.fetchone()
    if cached:
        return jsonify(sellerId=cached['seller_id'], levelId=cached['level_id'], reputation=cached['reputation'])
    try:
        profile = get_ml('/users/me', ml_token(user['id']))
    except UpstreamError as error:
        raise ApiError('seller_profile_unavailable', 502) from error
    levels = {'5_green': 'Verde', '4_light_green': 'Verde-claro', '3_yellow': 'Amarela',
              '2_orange': 'Laranja', '1_red': 'Vermelha', None: 'Sem reputação'}
    reputation = profile.get('seller_reputation') if isinstance(profile, dict) else None
    seller = str(profile.get('id', '')) if isinstance(profile, dict) else ''
    if (not seller.isdigit() or profile.get('site_id') != 'MLB' or not isinstance(reputation, dict)
            or 'level_id' not in reputation or not (reputation['level_id'] is None or isinstance(reputation['level_id'], str))
            or reputation['level_id'] not in levels):
        raise ApiError('seller_profile_invalid_response', 502)
    level = reputation['level_id']
    with db() as cur:
        # A concurrent account switch must not cache the old account's reputation.
        cur.execute("""INSERT INTO precify_seller_profiles(user_id,seller_id,level_id,reputation)
          SELECT usuario_id,id_ml::text,%s,%s FROM contas_mercado_livre
          WHERE usuario_id=%s AND id_ml::text=%s
          ON CONFLICT(user_id) DO UPDATE SET seller_id=EXCLUDED.seller_id,
          level_id=EXCLUDED.level_id,reputation=EXCLUDED.reputation,fetched_at=NOW()
          RETURNING seller_id""", (level, levels[level], user['id'], seller))
        if not cur.fetchone():
            raise ApiError('seller_account_changed', 409)
    return jsonify(sellerId=seller, levelId=level, reputation=levels[level])


def oauth_return_url(value):
    if value is None:
        return None
    if not isinstance(value, str) or len(value)>512:
        raise ApiError('invalid_return_url')
    if value == 'precificador://autorizacao-concluida':
        return value
    try:
        parsed = urlsplit(value)
        if (parsed.scheme in ('exp', 'exps') and not parsed.username and not parsed.password
                and not parsed.port and re.fullmatch(r'[a-zA-Z0-9-]+\.exp\.direct', parsed.hostname or '')
                and parsed.path == '/--/autorizacao-concluida' and not parsed.query and not parsed.fragment):
            return value
    except ValueError:
        pass
    raise ApiError('invalid_return_url')


@precify.post('/auth/connect')
def connect():
    user=identity()
    if not os.environ.get('MERCADO_LIVRE_CLIENT_ID'):
        raise ApiError('oauth_not_configured',503)
    return_url = oauth_return_url(body().get('returnUrl'))
    ticket=secrets.token_urlsafe(32)
    state='precify_'+secrets.token_urlsafe(32)
    with db() as cur:
        cur.execute('INSERT INTO precify_oauth(state,user_id,ticket_hash,code_verifier,expires_at,return_url) VALUES(%s,%s,%s,%s,%s,%s)',
          (state,user['id'],digest(ticket),secrets.token_urlsafe(48),now()+timedelta(minutes=10),return_url))
    return jsonify(url=public_base()+'/auth/precify/connect?'+urlencode({'ticket':ticket}))


def oauth_start():
    ticket=request.args.get('ticket','')
    if not 32<=len(ticket)<=128:
        return 'Autorização inválida. Volte ao Precify.',400
    with db() as cur:
        cur.execute('''UPDATE precify_oauth SET started_at=NOW() WHERE ticket_hash=%s AND expires_at>NOW()
          AND started_at IS NULL AND consumed_at IS NULL RETURNING state,code_verifier''',(digest(ticket),))
        row=cur.fetchone()
    if not row:
        return 'Esta autorização expirou. Volte ao Precify e tente novamente.',400
    challenge=base64.urlsafe_b64encode(hashlib.sha256(row['code_verifier'].encode()).digest()).decode().rstrip('=')
    params=dict(response_type='code',client_id=os.environ['MERCADO_LIVRE_CLIENT_ID'],
        redirect_uri=os.environ.get('MERCADO_LIVRE_REDIRECT_URI',public_base()+'/callback'),
        state=row['state'],code_challenge=challenge,code_challenge_method='S256')
    return redirect('https://auth.mercadolivre.com.br/authorization?'+urlencode(params))


def oauth_callback():
    state=request.args.get('state','')
    with db() as cur:
        cur.execute('''UPDATE precify_oauth SET consumed_at=NOW() WHERE state=%s AND expires_at>NOW()
          AND started_at IS NOT NULL AND consumed_at IS NULL RETURNING user_id,code_verifier,return_url''',(state,))
        row=cur.fetchone()
    if not row or not request.args.get('code'):
        return 'Autorização não concluída. Volte ao Precify para tentar novamente.',400
    try:
        response=requests.post('https://api.mercadolibre.com/oauth/token',data=dict(
            grant_type='authorization_code',client_id=os.environ.get('MERCADO_LIVRE_CLIENT_ID'),
            client_secret=os.environ.get('MERCADO_LIVRE_CLIENT_SECRET'),code=request.args['code'],
            redirect_uri=os.environ.get('MERCADO_LIVRE_REDIRECT_URI',public_base()+'/callback'),code_verifier=row['code_verifier']),
            timeout=(3,15),allow_redirects=False)
        data=response.json()
        if not response.ok or not isinstance(data,dict) or not data.get('access_token') or not data.get('refresh_token'):
            raise ValueError()
        expires=now()+timedelta(seconds=int(data['expires_in']))
        with db() as cur:
            cur.execute('''INSERT INTO contas_mercado_livre(usuario_id,acess_token,refresh_token,expiracao_token,id_ml)
              VALUES(%s,%s,%s,%s,%s) ON CONFLICT(usuario_id) DO UPDATE SET acess_token=EXCLUDED.acess_token,
              refresh_token=EXCLUDED.refresh_token,expiracao_token=EXCLUDED.expiracao_token,id_ml=EXCLUDED.id_ml,updated_at=NOW()''',
              (row['user_id'],data['access_token'],data['refresh_token'],expires.replace(tzinfo=None),data['user_id']))
    except (requests.RequestException,ValueError,KeyError,TypeError):
        return 'Não foi possível concluir a conexão. Volte ao Precify para tentar novamente.',502
    nonce=secrets.token_urlsafe(18)
    return render_template('precify_oauth_complete.html', return_url=row['return_url'] or 'precificador://',
                           automatic=bool(row['return_url']), nonce=nonce), 200, {
        'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':f"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-{nonce}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}



def completion_page(title, message):
    return ('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1">'
      '<title>Precify</title><body style="background:#08090c;color:#f4f4f5;font:18px system-ui;padding:48px 24px">'
      '<main style="max-width:420px;margin:10vh auto"><b style="color:#fee800">PRECIFY</b>'
      f'<h1>{title}</h1><p>{message}</p></main></body></html>',200,
      {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"})


@precify.get('/terms')
def terms():
    return render_template('precify_terms.html', version=TERMS_VERSION,
        legal_name=os.environ.get('NOVAI_LEGAL_NAME','NOVAI'),
        legal_contact=os.environ.get('NOVAI_LEGAL_CONTACT','Novai.ia@outlook.com'),
        legal_cnpj=os.environ.get('NOVAI_LEGAL_CNPJ',''), legal_address=os.environ.get('NOVAI_LEGAL_ADDRESS','')), 200, {
        'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"}


def ml_token(user_id):
    with db() as cur:
        cur.execute('SELECT * FROM contas_mercado_livre WHERE usuario_id=%s FOR UPDATE',(user_id,))
        row=cur.fetchone()
        if not row:
            raise ApiError('ml_connection_required',409)
        expiry=row['expiracao_token']
        if expiry and expiry.replace(tzinfo=expiry.tzinfo or UTC)>now()+timedelta(seconds=90):
            return row['acess_token']
        try:
            response=requests.post('https://api.mercadolibre.com/oauth/token',data=dict(grant_type='refresh_token',
                client_id=os.environ.get('MERCADO_LIVRE_CLIENT_ID'),client_secret=os.environ.get('MERCADO_LIVRE_CLIENT_SECRET'),
                refresh_token=row['refresh_token']),timeout=(3,12),allow_redirects=False)
            data=response.json()
            if not response.ok or not isinstance(data,dict) or not data.get('access_token'):
                raise ApiError('ml_reconnect_required',409)
            cur.execute('UPDATE contas_mercado_livre SET acess_token=%s,refresh_token=%s,expiracao_token=%s,updated_at=NOW() WHERE usuario_id=%s',
              (data['access_token'],data.get('refresh_token',row['refresh_token']),(now()+timedelta(seconds=int(data['expires_in']))).replace(tzinfo=None),user_id))
            return data['access_token']
        except (requests.RequestException,ValueError,KeyError,TypeError):
            raise ApiError('ml_unavailable',502) from None


@precify.post('/imports')
def imports():
    user=identity()
    data=body()
    url=data.get('url','')
    if not isinstance(url,str) or len(url)>4096:
        raise ApiError('invalid_product_url')
    try:
        parsed=urlsplit(url)
        port=parsed.port
    except ValueError:
        raise ApiError('invalid_product_url') from None
    if parsed.scheme!='https' or parsed.username or parsed.password or port or not (
        parsed.hostname in ('meli.la','mercadolivre.com.br','shopee.com.br','shope.ee','shp.ee','amazon.com.br','amzn.to')
        or any((parsed.hostname or '').endswith('.'+h) for h in ('mercadolivre.com.br','shopee.com.br','amazon.com.br'))):
        raise ApiError('invalid_product_url')
    key,plan=reserve_import(user['id'],data.get('requestKey'),url)
    return jsonify(importId=key,plan=plan)


@precify.get('/items/<item_id>/insights')
def insights(item_id):
    user=identity()
    require_feature(user['id'],'insights')  # MUST precede token lookup and all upstream calls.
    if not ITEM.fullmatch(item_id):
        raise ApiError('invalid_item_id')
    token=ml_token(user['id'])
    result=dict(itemId=item_id,sold=None,createdAt=None,missing=[])
    try:
        data=get_ml('/items/'+item_id,token,{'attributes':'id,sold_quantity,date_created'})
        if isinstance(data,dict) and data.get('id')==item_id:
            sold=data.get('sold_quantity')
            if isinstance(sold,int) and not isinstance(sold,bool) and sold>=0:
                result['sold']=sold
            if isinstance(data.get('date_created'),str):
                result['createdAt']={'iso':data['date_created'],'source':'ml_item'}
    except UpstreamError:
        result['missing'].append('item_unavailable')
    if not result['createdAt']:
        try:
            data=get_ml('/items/'+item_id+'/description',token)
            from item_dates import date_item
            date=date_item(item_id,data.get('date_created') if isinstance(data,dict) else None)
            if date['createdAt']:
                result['createdAt']={'iso':date['createdAt'],'source':'ml_description'}
        except UpstreamError:
            result['missing'].append('date_unavailable')
    return jsonify(result)


@precify.post('/imports/validate')
def validate_import():
    user=identity()
    data=body()
    if not isinstance(data.get('url'),str):
        raise ApiError('invalid_product_url')
    check_import(user['id'],data.get('importId'),data['url'])
    with db() as cur:
        return jsonify(ok=True,insights=plan_for(cur,user['id'])['features']['insights'])


@precify.post('/pricing')
def pricing():
    user=identity()
    data=body()
    if data.get('comparison'):
        require_feature(user['id'],'comparisons')
    from pricing_margin import margin
    # Invoke the existing, tested quote handler with the account's server-owned ML token.
    with current_app.test_request_context('/api/ext/pricing/margin',method='POST',json=data,
          headers={'Authorization':'Bearer '+ml_token(user['id'])}):
        return margin()


@precify.post('/trial')
def trial():
    identity()
    raise ApiError('payment_setup_required',409)


@precify.post('/comparison')
def comparison():
    """Other marketplaces use explicitly supplied account costs, never prototype fees."""
    from pricing_margin import number, money
    user=identity()
    require_feature(user['id'],'comparisons')
    data=body()
    if data.get('marketplace') not in ('shopee','amazon'):
        raise ApiError('invalid_marketplace')
    try:
        price=number(data.get('price'),0.01)
        cost=number(data.get('productCost'))+number(data.get('packagingCost'))
        commission=number(data.get('commissionPct'),0,100)
        fixed=number(data.get('fixedFee'))
        shipping=number(data.get('shipping'))
        tax=number(data.get('taxPct'),0,100)
    except ValueError:
        raise ApiError('comparison_costs_required') from None
    from decimal import Decimal
    fees=Decimal(str(money(price*commission/100+fixed)))
    taxes=Decimal(str(money(price*tax/100)))
    margin=price-cost-fees-shipping-taxes
    return jsonify(frete=money(shipping),tarifas=money(fees),impostos=money(taxes),custos=money(cost),
        margemContribuicao=money(margin),margemPct=money(margin/price*100),missing=[],source='user_costs')


def register_precify(app,socketio=None):
    from precify_billing import billing
    app.register_blueprint(precify)
    app.register_blueprint(billing)
    from account_email import email_api
    app.register_blueprint(email_api)
    app.add_url_rule('/auth/precify/connect','precify_oauth_start',oauth_start)

    if socketio is not None:
        from precify_realtime import register_realtime
        register_realtime(app,socketio)
