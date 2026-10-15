"""Mercado Pago subscriptions. Only verified approved payments grant paid access."""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import hmac
import os
import re
import time
from urllib.parse import urlsplit
from uuid import uuid4

from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request
import requests

from precify_core import ApiError, UTC, db, identity, now, plan_for

billing=Blueprint('precify_billing',__name__,url_prefix='/api/precify/billing')


@billing.errorhandler(ApiError)
def error_response(error):
    return jsonify(error=error.code),error.status


@billing.after_request
def private_response(response):
    response.headers['Cache-Control']='no-store'
    response.headers['Referrer-Policy']='no-referrer'
    return response


def configured():
    return bool(os.environ.get('MERCADO_PAGO_ACCESS_TOKEN') and os.environ.get('MERCADO_PAGO_WEBHOOK_SECRET'))


def mp(method,path,payload=None,key=None):
    if not configured():
        raise ApiError('payments_not_configured',503)
    headers={'Authorization':'Bearer '+os.environ['MERCADO_PAGO_ACCESS_TOKEN'],'Accept':'application/json'}
    if key:
        headers['X-Idempotency-Key']=str(key)
    try:
        response=requests.request(method,'https://api.mercadopago.com'+path,json=payload,headers=headers,
                                  timeout=(3,15),allow_redirects=False)
        if not response.ok:
            raise ApiError('payment_provider_unavailable',502)
        data=response.json()
        if not isinstance(data,dict):
            raise ValueError()
        return data
    except (requests.RequestException,ValueError):
        raise ApiError('payment_provider_unavailable',502) from None


def cents(value):
    try:
        result=Decimal(str(value))
        if not result.is_finite() or result<0:
            raise ValueError()
        return int((result*100).quantize(Decimal(1),rounding=ROUND_HALF_UP))
    except (ValueError,ArithmeticError):
        raise ApiError('invalid_provider_amount',502) from None


def stamp(value):
    try:
        result=datetime.fromisoformat(value.replace('Z','+00:00'))
        if result.tzinfo is None:
            raise ValueError()
        return result
    except (ValueError,TypeError,AttributeError):
        raise ApiError('invalid_provider_date',502) from None


@billing.get('/plans')
def plans():
    with db() as cur:
        cur.execute('SELECT code,name,monthly_cents,annual_cents,monthly_search_limit,trial_days FROM precify_plans ORDER BY monthly_cents')
        rows=cur.fetchall()
    return jsonify(plans=rows,paymentsEnabled=configured())


@billing.post('/checkout')
def checkout():
    from precify_api import body,public_base
    user=identity()
    data=body()
    tier,cycle=data.get('tier'),data.get('cycle')
    if tier not in ('plus','pro') or cycle not in ('monthly','annual'):
        raise ApiError('invalid_plan')
    if not configured():
        raise ApiError('payments_not_configured',503)
    payer=str(data.get('payerEmail',user['email'])).strip().lower()
    if len(payer)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',payer):
        raise ApiError('invalid_email')
    with db() as cur:
        cur.execute('SELECT id FROM usuarios WHERE id=%s FOR UPDATE',(user['id'],))
        cur.execute("SELECT * FROM precify_subscriptions WHERE user_id=%s AND status IN ('pending','authorized','creating') ORDER BY created_at DESC LIMIT 1",(user['id'],))
        existing=cur.fetchone()
        if existing and (existing['plan_code']!=tier or existing['cycle']!=cycle or existing['status']=='authorized'):
            raise ApiError('subscription_exists',409)
        if existing and existing['checkout_url']:
            return jsonify(url=existing['checkout_url'],subscriptionId=str(existing['id']))
        cur.execute('SELECT * FROM precify_plans WHERE code=%s',(tier,))
        plan=cur.fetchone()
        amount=plan['monthly_cents'] if cycle=='monthly' else plan['annual_cents']
        subscription=str(existing['id']) if existing else str(uuid4())
        if not existing:
            cur.execute('INSERT INTO precify_subscriptions(id,user_id,plan_code,cycle,amount_cents,status) VALUES(%s,%s,%s,%s,%s,%s)',
                        (subscription,user['id'],tier,cycle,amount,'creating'))
        state=plan_for(cur,user['id'])
    recurring=dict(frequency=1 if cycle=='monthly' else 12,frequency_type='months',currency_id='BRL',transaction_amount=amount/100)
    if state['status']=='trialing':
        recurring['start_date']=state['validUntil']
    payload=dict(reason='Precify '+tier.title()+' '+('mensal' if cycle=='monthly' else 'anual'),
        external_reference=subscription,payer_email=payer,auto_recurring=recurring,
        back_url=public_base()+'/api/precify/billing/return',status='pending')
    result=mp('POST','/preapproval',payload,key=subscription)
    url=result.get('init_point','')
    parsed=urlsplit(url)
    if parsed.scheme!='https' or parsed.username or parsed.hostname not in ('www.mercadopago.com.br','mercadopago.com.br') or not result.get('id'):
        raise ApiError('invalid_checkout_response',502)
    with db() as cur:
        cur.execute('UPDATE precify_subscriptions SET provider_id=%s,checkout_url=%s,status=%s,updated_at=NOW() WHERE id=%s',
                    (str(result['id']),url,'pending',subscription))
    return jsonify(url=url,subscriptionId=subscription)


@billing.get('/return')
def returned():
    from precify_api import completion_page
    # A browser redirect is never evidence of payment or authorization.
    return completion_page('Volte ao Precify','Você pode fechar esta janela. O app verificará a confirmação do pagamento com o Mercado Pago.')


@billing.get('/history')
def history():
    user=identity()
    with db() as cur:
        cur.execute('''SELECT id,plan_code,cycle,amount_cents,currency,status,next_payment_at,cancelled_at,created_at
          FROM precify_subscriptions WHERE user_id=%s ORDER BY created_at DESC LIMIT 30''',(user['id'],))
        subscriptions=cur.fetchall()
        cur.execute('''SELECT p.provider_id,p.amount_cents,p.currency,p.status,p.paid_at,p.period_end
          FROM precify_payments p JOIN precify_subscriptions s ON s.id=p.subscription_id WHERE s.user_id=%s
          ORDER BY p.created_at DESC LIMIT 30''',(user['id'],))
        payments=cur.fetchall()
    return jsonify(subscriptions=subscriptions,payments=payments)


@billing.post('/cancel')
def cancel():
    from precify_api import body
    user=identity()
    key=body().get('subscriptionId')
    with db() as cur:
        cur.execute('SELECT id,provider_id,status FROM precify_subscriptions WHERE id::text=%s AND user_id=%s',(str(key),user['id']))
        row=cur.fetchone()
    if not row:
        raise ApiError('subscription_not_found',404)
    if row['provider_id'] and row['status']!='cancelled':
        result=mp('PUT','/preapproval/'+row['provider_id'],{'status':'cancelled'})
        if result.get('status')!='cancelled':
            raise ApiError('cancellation_not_confirmed',502)
    with db() as cur:
        cur.execute("UPDATE precify_subscriptions SET status='cancelled',cancelled_at=COALESCE(cancelled_at,NOW()),updated_at=NOW() WHERE id=%s",(str(row['id']),))
    return jsonify(ok=True)


def verify_signature(signature,request_id,resource_id,secret,at=None):
    try:
        fields=dict(part.strip().split('=',1) for part in signature.split(','))
        ts=fields['ts']
        timestamp=int(ts)
        if timestamp>10**12:
            timestamp/=1000
        if abs((at if at is not None else time.time())-timestamp)>600:
            return False
        if not request_id or not resource_id or not secret:
            return False
        manifest=f'id:{resource_id.lower()};request-id:{request_id};ts:{ts};'
        expected=hmac.new(secret.encode(),manifest.encode(),hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected,fields['v1'])
    except (ValueError,KeyError,TypeError):
        return False


def record_payment(payment,preapproval_id=None):
    identifier=str(payment.get('id',''))
    if not re.fullmatch(r'\d{1,30}',identifier):
        raise ApiError('invalid_provider_payment',502)
    reference=str(payment.get('external_reference',''))
    with db() as cur:
        cur.execute('SELECT * FROM precify_subscriptions WHERE id::text=%s OR provider_id=%s FOR UPDATE',(reference,preapproval_id))
        sub=cur.fetchone()
        if not sub:
            return  # Not a Precify payment; never associate by email or a client-provided user ID.
        if preapproval_id and (sub['provider_id']!=preapproval_id or (reference and reference!=str(sub['id']))):
            raise ApiError('payment_subscription_mismatch',502)
        cur.execute('SELECT subscription_id FROM precify_payments WHERE provider_id=%s',(identifier,))
        previous=cur.fetchone()
        if previous and str(previous['subscription_id'])!=str(sub['id']):
            raise ApiError('payment_subscription_mismatch',502)
        if payment.get('currency_id')!='BRL' or cents(payment.get('transaction_amount'))!=sub['amount_cents']:
            raise ApiError('payment_amount_mismatch',502)
        collector=os.environ.get('MERCADO_PAGO_COLLECTOR_ID')
        if collector and str(payment.get('collector_id'))!=collector:
            raise ApiError('payment_collector_mismatch',502)
        status=payment.get('status')
        if status not in ('approved','pending','in_process','rejected','cancelled','refunded','charged_back','in_mediation'):
            raise ApiError('invalid_payment_status',502)
        if cents(payment.get('transaction_amount_refunded',0))>0:
            status='refunded'
        updated=stamp(payment.get('date_last_updated'))
        paid=stamp(payment['date_approved']) if payment.get('date_approved') else None
        if status=='approved' and (paid is None or paid>now()+relativedelta(minutes=5)):
            raise ApiError('invalid_payment_date',502)
        until=paid+relativedelta(months=1 if sub['cycle']=='monthly' else 12) if paid else None
        cur.execute('''INSERT INTO precify_payments(provider_id,subscription_id,amount_cents,currency,status,paid_at,period_end,provider_updated_at)
          VALUES(%s,%s,%s,'BRL',%s,%s,%s,%s) ON CONFLICT(provider_id) DO UPDATE SET status=EXCLUDED.status,
          paid_at=EXCLUDED.paid_at,period_end=EXCLUDED.period_end,provider_updated_at=EXCLUDED.provider_updated_at,updated_at=NOW()
          WHERE precify_payments.provider_updated_at<=EXCLUDED.provider_updated_at''',
          (identifier,str(sub['id']),sub['amount_cents'],status,paid,until,updated))


@billing.post('/webhook')
def webhook():
    if request.content_length and request.content_length>32768:
        raise ApiError('request_too_large',413)
    data=request.get_json(silent=True) or {}
    resource=request.args.get('data.id','')
    request_id=request.headers.get('x-request-id','')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',resource) or not verify_signature(
        request.headers.get('x-signature',''),request_id,resource,os.environ.get('MERCADO_PAGO_WEBHOOK_SECRET','')):
        raise ApiError('invalid_signature',401)
    if not isinstance(data,dict) or not isinstance(data.get('data'),dict) or str(data['data'].get('id',''))!=resource:
        raise ApiError('resource_mismatch')
    kind=data.get('type')
    if kind not in ('payment','subscription_preapproval','subscription_authorized_payment'):
        return jsonify(ok=True)
    with db() as cur:
        cur.execute('''INSERT INTO precify_billing_events(resource_type,resource_id,request_id) VALUES(%s,%s,%s)
          ON CONFLICT DO NOTHING''',(kind,resource,request_id))
    if kind=='subscription_preapproval':
        result=mp('GET','/preapproval/'+resource)
        recurring=result.get('auto_recurring') or {}
        with db() as cur:
            cur.execute('SELECT * FROM precify_subscriptions WHERE provider_id=%s FOR UPDATE',(resource,))
            sub=cur.fetchone()
            if sub:
                if str(result.get('external_reference'))!=str(sub['id']) or recurring.get('currency_id')!='BRL' or cents(recurring.get('transaction_amount'))!=sub['amount_cents']:
                    raise ApiError('subscription_mismatch',502)
                status=result.get('status')
                if status not in ('authorized','pending','paused','cancelled'):
                    raise ApiError('invalid_subscription_status',502)
                next_at=stamp(result['next_payment_date']) if result.get('next_payment_date') else None
                cur.execute('UPDATE precify_subscriptions SET status=%s,next_payment_at=%s,updated_at=NOW(),cancelled_at=CASE WHEN %s=\'cancelled\' THEN COALESCE(cancelled_at,NOW()) ELSE cancelled_at END WHERE id=%s',
                            (status,next_at,status,str(sub['id'])))
    elif kind=='subscription_authorized_payment':
        invoice=mp('GET','/authorized_payments/'+resource)
        payment_id=(invoice.get('payment') or {}).get('id')
        if payment_id and re.fullmatch(r'\d{1,30}',str(payment_id)):
            record_payment(mp('GET','/v1/payments/'+str(payment_id)),str(invoice.get('preapproval_id','')))
    else:
        record_payment(mp('GET','/v1/payments/'+resource))
    with db() as cur:
        cur.execute("UPDATE precify_billing_events SET processed_at=NOW(),status='processed' WHERE resource_type=%s AND resource_id=%s AND request_id=%s",(kind,resource,request_id))
    return jsonify(ok=True)
