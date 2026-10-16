"""Mercado Pago subscriptions. Only verified approved payments grant paid access."""
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import hmac
import os
import re
import time
from urllib.parse import urlencode, urlsplit
from uuid import uuid4

from dateutil.relativedelta import relativedelta
from flask import Blueprint, jsonify, request
import requests

from precify_core import ApiError, db, identity, now, plan_for
from precify_realtime import notify_plan_changed

BILLING_TERMS_VERSION='2026-10-15-trial-payment'

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
    return jsonify(plans=rows,paymentsEnabled=configured(),trialCheckoutEnabled=configured(),billingTermsVersion=BILLING_TERMS_VERSION)


def provider_id(value):
    value=str(value or '')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',value):
        raise ApiError('invalid_provider_id',502)
    return value


def validate_recurring(recurring,amount,cycle,trial_days=0):
    if (not isinstance(recurring,dict) or recurring.get('currency_id')!='BRL'
        or cents(recurring.get('transaction_amount'))!=amount
        or recurring.get('frequency_type')!='months'
        or recurring.get('frequency')!=(1 if cycle=='monthly' else 12)):
        raise ApiError('subscription_mismatch',502)
    if trial_days:
        trial=recurring.get('free_trial') or {}
        if trial.get('frequency')!=trial_days or trial.get('frequency_type')!='days':
            raise ApiError('trial_not_confirmed',502)
        if recurring.get('billing_day_proportional'):
            raise ApiError('trial_not_confirmed',502)


@billing.post('/checkout')
def checkout():
    from precify_api import body,public_base
    user=identity()
    data=body()
    tier,cycle=data.get('tier'),data.get('cycle')
    trial=data.get('trial',False)
    if tier not in ('plus','pro') or cycle not in ('monthly','annual') or type(trial) is not bool or (trial and tier!='pro'):
        raise ApiError('invalid_plan')
    if not configured():
        raise ApiError('payments_not_configured',503)
    if trial and data.get('billingTermsVersion')!=BILLING_TERMS_VERSION:
        raise ApiError('billing_terms_required')
    payer=str(data.get('payerEmail',user['email'])).strip().lower()
    if len(payer)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',payer):
        raise ApiError('invalid_email')
    # Serialize checkouts across devices, including the provider call.
    with db() as cur:
        cur.execute('SELECT id FROM usuarios WHERE id=%s FOR UPDATE',(user['id'],))
        state=plan_for(cur,user['id'])
        if trial and (not state['trialAvailable'] or state['tier']!='free'):
            raise ApiError('trial_already_used',409)
        cur.execute("SELECT * FROM precify_subscriptions WHERE user_id=%s AND status IN ('pending','authorized','paused','creating') ORDER BY created_at DESC LIMIT 1",(user['id'],))
        existing=cur.fetchone()
        if existing and (existing['plan_code']!=tier or existing['cycle']!=cycle or bool(existing['trial_days'])!=trial or existing['status'] in ('authorized','paused')):
            raise ApiError('subscription_exists',409)
        if existing and existing['checkout_url']:
            return jsonify(url=existing['checkout_url'],subscriptionId=str(existing['id']))
        # Legacy trials remain valid, but cannot silently turn into immediate charges.
        if state['status']=='trialing':
            raise ApiError('trial_in_progress',409)
        cur.execute('SELECT * FROM precify_plans WHERE code=%s',(tier,))
        plan=cur.fetchone()
        amount=plan['monthly_cents'] if cycle=='monthly' else plan['annual_cents']
        days=7 if trial else 0
        subscription=str(existing['id']) if existing else str(uuid4())
        if not existing:
            cur.execute("""INSERT INTO precify_subscriptions(id,user_id,plan_code,cycle,amount_cents,status,trial_days,billing_consent_version,billing_consent_at)
              VALUES(%s,%s,%s,%s,%s,'creating',%s,%s,NOW())""",
              (subscription,user['id'],tier,cycle,amount,days,BILLING_TERMS_VERSION if trial else None))
        recurring=dict(frequency=1 if cycle=='monthly' else 12,frequency_type='months',currency_id='BRL',transaction_amount=amount/100)
        payload=dict(reason='Precify '+tier.title()+' '+('mensal' if cycle=='monthly' else 'anual'),
            auto_recurring=recurring,back_url=public_base()+'/api/precify/billing/return')
        if trial:
            recurring['free_trial']=dict(frequency=days,frequency_type='days')
            payload['payment_methods_allowed']={'payment_types':[{'id':'credit_card'}]}
            # One plan per checkout: the verified plan ID binds the hosted form to this account.
            result=mp('POST','/preapproval_plan',payload,key=subscription)
            validate_recurring(result.get('auto_recurring'),amount,cycle,days)
            if result.get('status')!='active':
                raise ApiError('invalid_checkout_response',502)
        else:
            payload.update(external_reference=subscription,payer_email=payer,status='pending')
            result=mp('POST','/preapproval',payload,key=subscription)
        identifier=provider_id(result.get('id'))
        url=result.get('init_point','')
        parsed=urlsplit(url)
        if parsed.scheme!='https' or parsed.username or parsed.hostname not in ('www.mercadopago.com.br','mercadopago.com.br'):
            raise ApiError('invalid_checkout_response',502)
        cur.execute("""UPDATE precify_subscriptions SET provider_id=%s,provider_plan_id=%s,
          checkout_url=%s,status='pending',updated_at=NOW() WHERE id=%s""",
          (None if trial else identifier,identifier if trial else None,url,subscription))
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
        cur.execute('SELECT id,provider_id,provider_plan_id,provider_plan_closed,status FROM precify_subscriptions WHERE id::text=%s AND user_id=%s',(str(key),user['id']))
        row=cur.fetchone()
    if not row:
        raise ApiError('subscription_not_found',404)
    if row['provider_plan_id']:
        close_trial_plan(row)
        # Reconcile a registration completed just before cancellation.
        sync_subscription(row)
        with db() as cur:
            cur.execute('SELECT * FROM precify_subscriptions WHERE id=%s',(str(row['id']),))
            row=cur.fetchone()
    if row['provider_id'] and row['status']!='cancelled':
        result=mp('PUT','/preapproval/'+row['provider_id'],{'status':'cancelled'})
        if result.get('status') not in ('cancelled','canceled'):
            raise ApiError('cancellation_not_confirmed',502)
    with db() as cur:
        cur.execute("UPDATE precify_subscriptions SET status='cancelled',cancelled_at=COALESCE(cancelled_at,NOW()),updated_at=NOW() WHERE id=%s",(str(row['id']),))
    notify_plan_changed(user['id'])
    return jsonify(ok=True)


def close_trial_plan(sub):
    """Close the individual checkout link; MP keeps its existing subscriber active."""
    if not sub.get('provider_plan_id') or sub.get('provider_plan_closed'):
        return
    result=mp('PUT','/preapproval_plan/'+provider_id(sub['provider_plan_id']),{'status':'cancelled'})
    if result.get('status') not in ('cancelled','canceled'):
        raise ApiError('cancellation_not_confirmed',502)
    with db() as cur:
        cur.execute('UPDATE precify_subscriptions SET provider_plan_closed=TRUE WHERE id=%s',(str(sub['id']),))


def record_subscription(resource,result):
    """Only data retrieved with the server credential may reach this function."""
    resource=provider_id(resource)
    if str(result.get('id'))!=resource:
        raise ApiError('subscription_mismatch',502)
    plan_id=str(result.get('preapproval_plan_id') or '')
    cancel_extra=False
    close=None
    changed=False
    with db() as cur:
        cur.execute('SELECT user_id FROM precify_subscriptions WHERE provider_id=%s OR provider_plan_id=%s',(resource,plan_id))
        owner=cur.fetchone()
        if not owner:
            return
        cur.execute('SELECT id FROM usuarios WHERE id=%s FOR UPDATE',(owner['user_id'],))
        cur.execute('SELECT * FROM precify_subscriptions WHERE provider_id=%s OR provider_plan_id=%s FOR UPDATE',(resource,plan_id))
        sub=cur.fetchone()
        recurring=result.get('auto_recurring') or {}
        validate_recurring(recurring,sub['amount_cents'],sub['cycle'])
        if sub['provider_plan_id']:
            if plan_id!=sub['provider_plan_id']:
                raise ApiError('subscription_mismatch',502)
        elif str(result.get('external_reference'))!=str(sub['id']):
            raise ApiError('subscription_mismatch',502)
        collector=os.environ.get('MERCADO_PAGO_COLLECTOR_ID')
        if collector and str(result.get('collector_id'))!=collector:
            raise ApiError('subscription_mismatch',502)
        status=result.get('status')
        if status=='canceled':status='cancelled'
        if status not in ('authorized','pending','paused','cancelled'):
            raise ApiError('invalid_subscription_status',502)
        updated=stamp(result.get('last_modified'))
        if sub['provider_id']==resource and sub['provider_updated_at'] and updated<sub['provider_updated_at']:
            return
        if sub['status']=='cancelled' or (sub['provider_id'] and sub['provider_id']!=resource):
            # A reused personal checkout must never start another renewal or another trial.
            cancel_extra=status!='cancelled'
        elif sub['provider_plan_id'] and not sub['provider_id'] and status!='authorized':
            return  # An abandoned form does not consume the account's trial.
        else:
            next_at=stamp(result['next_payment_date']) if result.get('next_payment_date') else None
            start,end=sub['trial_started_at'],sub['trial_ends_at']
            if sub['trial_days'] and status=='authorized' and not start:
                try:
                    validate_recurring(recurring,sub['amount_cents'],sub['cycle'],sub['trial_days'])
                    start=stamp(result.get('date_created'))
                    end=start+timedelta(days=sub['trial_days'])
                    if start<sub['created_at']-timedelta(minutes=5) or start>now()+timedelta(minutes=5) or not next_at or next_at+timedelta(seconds=1)<end:
                        raise ApiError('trial_not_confirmed',502)
                except ApiError:
                    # Do not leave a new trial charging earlier than the offered period.
                    cancelled=mp('PUT','/preapproval/'+resource,{'status':'cancelled'})
                    if cancelled.get('status') not in ('cancelled','canceled'):
                        raise ApiError('cancellation_not_confirmed',502)
                    raise
                cur.execute('SELECT trial_started_at FROM precify_accounts WHERE user_id=%s FOR UPDATE',(sub['user_id'],))
                if cur.fetchone()['trial_started_at']:
                    cancel_extra=True
                else:
                    cur.execute('UPDATE precify_accounts SET trial_started_at=%s,trial_ends_at=%s WHERE user_id=%s',
                                (start,end,sub['user_id']))
            if not cancel_extra:
                changed=(sub['status']!=status or sub['trial_started_at']!=start or sub['next_payment_at']!=next_at)
                cur.execute("""UPDATE precify_subscriptions SET provider_id=%s,status=%s,next_payment_at=%s,
                  provider_updated_at=%s,trial_started_at=%s,trial_ends_at=%s,updated_at=NOW(),
                  cancelled_at=CASE WHEN %s='cancelled' THEN COALESCE(cancelled_at,NOW()) ELSE cancelled_at END WHERE id=%s""",
                  (resource,status,next_at,updated,start,end,status,str(sub['id'])))
                if sub['provider_plan_id'] and status=='authorized':close=sub
    if changed:
        notify_plan_changed(owner['user_id'])
    if cancel_extra:
        result=mp('PUT','/preapproval/'+resource,{'status':'cancelled'})
        if result.get('status') not in ('cancelled','canceled'):
            raise ApiError('cancellation_not_confirmed',502)
    if close:
        close_trial_plan(close)


def sync_subscription(sub):
    if sub.get('provider_id'):
        identifier=provider_id(sub['provider_id'])
        record_subscription(identifier,mp('GET','/preapproval/'+identifier))
    elif sub.get('provider_plan_id'):
        query=urlencode({'preapproval_plan_id':sub['provider_plan_id'],'limit':20})
        result=mp('GET','/preapproval/search?'+query)
        for match in result.get('results',[]):
            identifier=provider_id(match.get('id'))
            record_subscription(identifier,mp('GET','/preapproval/'+identifier))


def reconcile_subscription(sub):
    """Recover missed payment/refund webhooks using server-authenticated resources."""
    deadline=time.monotonic()+45
    def read(path):
        if time.monotonic()>deadline: raise ApiError('incomplete_payment_reconciliation',502)
        return mp('GET',path)
    sync_subscription(sub)
    with db() as cur:
        cur.execute('SELECT * FROM precify_subscriptions WHERE id=%s',(str(sub['id']),))
        current=cur.fetchone()
    if not current or not current['provider_id']: return
    identifier=provider_id(current['provider_id'])
    seen=set()
    # Bounded pagination; incomplete reconciliation is an error, never a success.
    for offset in range(0,1000,100):
        result=read('/authorized_payments/search?'+urlencode({'preapproval_id':identifier,'limit':100,'offset':offset}))
        rows=result.get('results')
        if not isinstance(rows,list): raise ApiError('invalid_provider_response',502)
        for summary in rows:
            invoice_id=provider_id(summary.get('id'))
            invoice=read('/authorized_payments/'+invoice_id)
            if str(invoice.get('id'))!=invoice_id or str(invoice.get('preapproval_id'))!=identifier:
                raise ApiError('payment_subscription_mismatch',502)
            payment_id=str((invoice.get('payment') or {}).get('id') or '')
            if not payment_id: continue  # Scheduled invoices have no payment yet.
            if not re.fullmatch(r'\d{1,30}',payment_id): raise ApiError('invalid_provider_payment',502)
            if payment_id not in seen:
                payment=read('/v1/payments/'+payment_id)
                if str(payment.get('id'))!=payment_id: raise ApiError('payment_subscription_mismatch',502)
                record_payment(payment,identifier)
                seen.add(payment_id)
        total=(result.get('paging') or {}).get('total')
        if (isinstance(total,int) and offset+len(rows)>=total) or (total is None and len(rows)<100): break
        if not rows: raise ApiError('incomplete_payment_reconciliation',502)
    else: raise ApiError('incomplete_payment_reconciliation',502)
    # Revisit existing payments too: a refund can arrive without a new invoice.
    with db() as cur:
        cur.execute('SELECT provider_id FROM precify_payments WHERE subscription_id=%s AND period_end>NOW()', (str(sub['id']),))
        existing=cur.fetchall()
    for row in existing:
        if row['provider_id'] not in seen:
            payment=read('/v1/payments/'+provider_id(row['provider_id']))
            if str(payment.get('id'))!=row['provider_id']: raise ApiError('payment_subscription_mismatch',502)
            record_payment(payment,identifier)


@billing.post('/sync')
def sync():
    user=identity()
    from precify_core import rate_limit
    rate_limit('billing-sync:'+str(user['id']),limit=30)
    with db() as cur:
        cur.execute("SELECT * FROM precify_subscriptions WHERE user_id=%s AND (status IN ('pending','authorized','paused') OR EXISTS (SELECT 1 FROM precify_payments p WHERE p.subscription_id=precify_subscriptions.id AND p.period_end>NOW())) ORDER BY created_at DESC LIMIT 5",(user['id'],))
        subscriptions=cur.fetchall()
    for sub in subscriptions:
        reconcile_subscription(sub)
    with db() as cur:
        state=plan_for(cur,user['id'])
    return jsonify(plan=state)


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
            # Hosted-plan payments need not carry our external_reference. Refund events
            # still belong to the subscription previously verified via its invoice.
            cur.execute('''SELECT s.* FROM precify_subscriptions s JOIN precify_payments p ON p.subscription_id=s.id
              WHERE p.provider_id=%s FOR UPDATE OF s''',(identifier,))
            sub=cur.fetchone()
        if not sub:
            return  # Never associate by email or a client-provided user ID.
        if preapproval_id and (sub['provider_id']!=preapproval_id or (not sub['provider_plan_id'] and reference and reference!=str(sub['id']))):
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
        changed=bool(cur.rowcount)
    if changed:
        notify_plan_changed(sub['user_id'])


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
        record_subscription(resource,mp('GET','/preapproval/'+resource))
    elif kind=='subscription_authorized_payment':
        invoice=mp('GET','/authorized_payments/'+resource)
        payment_id=(invoice.get('payment') or {}).get('id')
        if invoice.get('preapproval_id'):
            preapproval=provider_id(invoice['preapproval_id'])
            record_subscription(preapproval,mp('GET','/preapproval/'+preapproval))
        if payment_id and re.fullmatch(r'\d{1,30}',str(payment_id)):
            record_payment(mp('GET','/v1/payments/'+str(payment_id)),str(invoice.get('preapproval_id','')))
    else:
        record_payment(mp('GET','/v1/payments/'+resource))
    with db() as cur:
        cur.execute("UPDATE precify_billing_events SET processed_at=NOW(),status='processed' WHERE resource_type=%s AND resource_id=%s AND request_id=%s",(kind,resource,request_id))
    return jsonify(ok=True)
