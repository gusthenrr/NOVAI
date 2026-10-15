"""Precify v2 API. ML credentials never leave NOVAI for these app sessions."""
import base64
from datetime import timedelta
import hashlib
import os
import re
import secrets
from urllib.parse import urlencode, urlsplit

import bcrypt
from flask import Blueprint, current_app, jsonify, redirect, request
import psycopg2
import requests

from precify_core import ApiError, UTC, account, check_import, db, digest, identity, new_session, now, plan_for, rate_limit, require_feature, reserve_import
from pricing_margin import UpstreamError, get_ml

precify = Blueprint('precify', __name__, url_prefix='/api/precify')
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
        cur.execute('SELECT id FROM contas_mercado_livre WHERE usuario_id=%s',(user['id'],))
        linked=bool(cur.fetchone())
        result=dict(user=dict(id=str(user['id']),email=user['email'],name=user['usuario']),linked=linked,plan=plan_for(cur,user['id']))
    if token:
        result['sessionToken']=token
    return result


@precify.post('/auth/login')
def login():
    data=body()
    email=str(data.get('email','')).strip().lower()
    password=data.get('password')
    rate_limit('login:'+email)
    rate_limit('login-ip:'+str(request.remote_addr))
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254 or not isinstance(password,str) or not 1<=len(password.encode())<=72:
        raise ApiError('invalid_credentials',401)
    with db() as cur:
        cur.execute('SELECT id,email,usuario,senha FROM usuarios WHERE LOWER(email)=%s',(email,))
        user=cur.fetchone()
        if not user or not bcrypt.checkpw(password.encode(),user['senha'].encode()):
            raise ApiError('invalid_credentials',401)
        token=new_session(cur,user['id'])
    return jsonify(session_data(user,token))


@precify.post('/auth/register')
def register():
    data=body()
    email=str(data.get('email','')).strip().lower()
    name=str(data.get('name','')).strip()
    password=data.get('password')
    rate_limit('register:'+str(request.remote_addr))
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email) or len(email)>254 or not 2<=len(name)<=100:
        raise ApiError('invalid_registration')
    if not isinstance(password,str) or not 8<=len(password) or len(password.encode())>72:
        raise ApiError('invalid_password')
    if data.get('acceptedTerms') is not True or data.get('termsVersion')!=TERMS_VERSION:
        raise ApiError('terms_required')
    # Use the same NOVAI account table and password format as the existing signup.
    try:
        with db() as cur:
            cur.execute('SELECT id FROM usuarios WHERE LOWER(email)=%s',(email,))
            if cur.fetchone():
                raise ApiError('email_in_use',409)
            cur.execute('INSERT INTO usuarios(usuario,email,senha) VALUES(%s,%s,%s) RETURNING id,email,usuario',
                        (name,email,bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode()))
            user=cur.fetchone()
            cur.execute('INSERT INTO precify_consents(user_id,purpose,version) VALUES(%s,%s,%s)',(user['id'],'precify_terms',TERMS_VERSION))
            token=new_session(cur,user['id'])
    except psycopg2.errors.UniqueViolation:
        raise ApiError('email_in_use',409) from None
    return jsonify(session_data(user,token)),201


@precify.get('/session')
def session():
    return jsonify(session_data(identity()))


@precify.post('/auth/logout')
def logout():
    identity()
    with db() as cur:
        cur.execute('UPDATE precify_sessions SET revoked_at=NOW() WHERE token_hash=%s',(digest(request.headers['X-Precify-Session']),))
    return jsonify(ok=True)


@precify.post('/auth/connect')
def connect():
    user=identity()
    if not os.environ.get('MERCADO_LIVRE_CLIENT_ID'):
        raise ApiError('oauth_not_configured',503)
    ticket=secrets.token_urlsafe(32)
    state='precify_'+secrets.token_urlsafe(32)
    with db() as cur:
        cur.execute('INSERT INTO precify_oauth(state,user_id,ticket_hash,code_verifier,expires_at) VALUES(%s,%s,%s,%s,%s)',
          (state,user['id'],digest(ticket),secrets.token_urlsafe(48),now()+timedelta(minutes=10)))
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
          AND started_at IS NOT NULL AND consumed_at IS NULL RETURNING user_id,code_verifier''',(state,))
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
    return completion_page('Mercado Livre conectado','Você já pode fechar esta janela e voltar ao Precify.')


def completion_page(title, message):
    return ('<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1">'
      '<title>Precify</title><body style="background:#08090c;color:#f4f4f5;font:18px system-ui;padding:48px 24px">'
      '<main style="max-width:420px;margin:10vh auto"><b style="color:#fee800">PRECIFY</b>'
      f'<h1>{title}</h1><p>{message}</p></main></body></html>',200,
      {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"})


@precify.get('/terms')
def terms():
    return completion_page('Acordo NOVAI e Precify',
        'Ao criar sua conta, você autoriza o armazenamento do seu cadastro, da sua assinatura e do uso mensal do Precify. '
        'A conexão com o Mercado Livre será autorizada separadamente na página oficial. '
        'As estimativas dependem dos dados disponíveis e dos custos que você informa. '
        'O plano grátis permite 10 buscas por mês, renovadas no primeiro dia do mês no horário de Brasília. '
        'O teste Pro dura 7 dias, uma vez por conta, após cadastrar e autorizar o pagamento no Mercado Pago. '
        'Após o teste, o plano escolhido é cobrado automaticamente, salvo cancelamento antes da primeira cobrança. '
        'O valor e a periodicidade são apresentados antes da autorização. Versão '+TERMS_VERSION+'.')


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


def register_precify(app):
    from precify_billing import billing
    app.register_blueprint(precify)
    app.register_blueprint(billing)
    app.add_url_rule('/auth/precify/connect','precify_oauth_start',oauth_start)
