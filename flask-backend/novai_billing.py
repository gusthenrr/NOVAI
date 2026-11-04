"""NOVAI website adapter for the shared Mercado Pago subscription flow."""
import os
from urllib.parse import urlsplit
from flask import Blueprint,jsonify,redirect,request
from precify_core import ApiError,db,rate_limit
from novai_plans import novai_plan_for,NOVAI_BILLING_TERMS_VERSION
from precify_billing import configured,create_checkout,cancel_subscription,reconcile_subscription

novai_billing=Blueprint('novai_billing',__name__,url_prefix='/api/novai/billing')


def frontend():
    value=(os.environ.get('FRONTEND_URL') or 'https://appealing-dream-production-1594.up.railway.app').strip().rstrip('/')
    if '://' not in value: value='https://'+value
    parsed=urlsplit(value)
    if parsed.scheme!='https' or not parsed.netloc or parsed.username or parsed.password:
        raise ApiError('site_not_configured',503)
    return value


@novai_billing.errorhandler(ApiError)
def error_response(error):
    return jsonify(error=error.code),error.status


@novai_billing.before_request
def guard():
    if request.content_length and request.content_length>8192: raise ApiError('request_too_large',413)
    if request.method in ('POST','OPTIONS') and request.headers.get('Origin')!=frontend():
        raise ApiError('origin_denied',403)
    if request.method=='OPTIONS': return '',204
    if request.method=='POST' and not request.is_json: raise ApiError('invalid_json')


@novai_billing.after_request
def headers(response):
    response.headers['Cache-Control']='no-store'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['X-Content-Type-Options']='nosniff'
    try: origin=frontend()
    except ApiError: return response
    if request.headers.get('Origin')==origin:
        response.headers['Access-Control-Allow-Origin']=origin
        response.headers['Access-Control-Allow-Headers']='Authorization, Content-Type'
        response.headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'
        response.vary.add('Origin')
    return response


def web_identity():
    # Explicit bearer auth: a cross-site POST with cookies alone cannot buy/cancel.
    auth=request.headers.get('Authorization','')
    if not auth.startswith('Bearer ') or len(auth)>8192: raise ApiError('session_required',401)
    from security_legacy import jwt_user
    identifier,_=jwt_user(auth[7:])
    with db() as cur:
        cur.execute('SELECT id,email,usuario FROM usuarios WHERE id=%s',(identifier,))
        user=cur.fetchone()
    if not user: raise ApiError('session_required',401)
    return user


def payload():
    value=request.get_json(silent=True)
    if not isinstance(value,dict): raise ApiError('invalid_json')
    return value


@novai_billing.get('/plans')
def plans():
    with db() as cur:
        cur.execute('SELECT code,name,monthly_cents,annual_cents,trial_days FROM novai_plans ORDER BY monthly_cents')
        rows=cur.fetchall()
        cur.execute("SELECT monthly_cents,annual_cents FROM precify_plans WHERE code='pro'")
        precify=cur.fetchone()
    return jsonify(precifyPro=precify,plans=rows,paymentsEnabled=configured(),billingTermsVersion=NOVAI_BILLING_TERMS_VERSION)


@novai_billing.get('/account')
def account():
    user=web_identity()
    with db() as cur:
        plan=novai_plan_for(cur,user['id'])
        cur.execute("""SELECT id,novai_plan_code AS tier,cycle,amount_cents,status,next_payment_at,cancelled_at,
          trial_ends_at FROM precify_subscriptions WHERE user_id=%s AND product_code='novai'
          ORDER BY created_at DESC LIMIT 30""",(user['id'],))
        subscriptions=cur.fetchall()
    return jsonify(user=dict(email=user['email']),plan=plan,subscriptions=subscriptions)


@novai_billing.post('/checkout')
def checkout():
    user=web_identity()
    rate_limit('novai-checkout:'+str(user['id']),limit=20)
    return jsonify(create_checkout(user,payload(),'novai'))


@novai_billing.post('/cancel')
def cancel():
    user=web_identity()
    rate_limit('novai-cancel:'+str(user['id']),limit=20)
    return jsonify(cancel_subscription(user,payload().get('subscriptionId'),'novai'))


@novai_billing.post('/sync')
def sync():
    user=web_identity()
    rate_limit('novai-billing-sync:'+str(user['id']),limit=30)
    with db() as cur:
        cur.execute("""SELECT * FROM precify_subscriptions WHERE user_id=%s AND product_code='novai'
          AND (status IN ('pending','authorized','paused') OR EXISTS(SELECT 1 FROM precify_payments p
          WHERE p.subscription_id=precify_subscriptions.id AND p.period_end>NOW()))
          ORDER BY created_at DESC LIMIT 5""",(user['id'],))
        subscriptions=cur.fetchall()
    for sub in subscriptions: reconcile_subscription(sub)
    with db() as cur: plan=novai_plan_for(cur,user['id'])
    return jsonify(plan=plan)


@novai_billing.get('/return')
def returned():
    # Never trust query-string payment status. The site re-reads the signed backend state.
    return redirect(frontend()+'/planos?retorno=1',code=303)
