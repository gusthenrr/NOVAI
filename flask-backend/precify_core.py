"""Server-owned Precify identity, entitlements and atomic monthly allowance."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import os
import secrets
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import psycopg2
from psycopg2.extras import RealDictCursor
from flask import current_app, request

UTC = timezone.utc
BR = ZoneInfo('America/Sao_Paulo')


class ApiError(Exception):
    def __init__(self, code, status=400):
        self.code, self.status = code, status


def now():
    return datetime.now(UTC)


def digest(value):
    return sha256(value.encode()).hexdigest()


@contextmanager
def db():
    factory = current_app.config.get('PRECIFY_DB_FACTORY')
    conn = factory() if factory else psycopg2.connect(os.environ['DATABASE_URL'], cursor_factory=RealDictCursor, connect_timeout=10)
    try:
        with conn:
            with conn.cursor() as cur:
                yield cur
    finally:
        conn.close()


def account(cur, user_id):
    cur.execute('INSERT INTO precify_accounts(user_id) VALUES(%s) ON CONFLICT DO NOTHING', (user_id,))


def identity():
    token = request.headers.get('X-Precify-Session', '')
    if not 32 <= len(token) <= 128 or any(c.isspace() for c in token):
        raise ApiError('session_required', 401)
    with db() as cur:
        cur.execute('''SELECT u.id,u.email,u.usuario FROM precify_sessions s JOIN usuarios u ON u.id=s.user_id
          WHERE s.token_hash=%s AND s.expires_at>NOW() AND s.revoked_at IS NULL''', (digest(token),))
        user = cur.fetchone()
        if not user:
            raise ApiError('session_expired', 401)
    return user


def new_session(cur, user_id):
    token = secrets.token_urlsafe(48)
    cur.execute('INSERT INTO precify_sessions(token_hash,user_id,expires_at) VALUES(%s,%s,%s)',
                (digest(token), user_id, now()+timedelta(days=90)))
    account(cur, user_id)
    return token


def month_window(at=None):
    local = (at or now()).astimezone(BR)
    start = local.replace(day=1,hour=0,minute=0,second=0,microsecond=0)
    end = (start.replace(day=28)+timedelta(days=4)).replace(day=1)
    return start.date(), end.isoformat()


def plan_for(cur, user_id):
    account(cur, user_id)
    cur.execute('SELECT trial_started_at,trial_ends_at FROM precify_accounts WHERE user_id=%s', (user_id,))
    trial = cur.fetchone()
    cur.execute('''SELECT s.plan_code,p.period_end FROM precify_subscriptions s JOIN precify_payments p ON p.subscription_id=s.id
      WHERE s.user_id=%s AND p.status='approved' AND p.period_end>NOW()
      ORDER BY CASE s.plan_code WHEN 'pro' THEN 2 ELSE 1 END DESC,p.period_end DESC LIMIT 1''', (user_id,))
    paid = cur.fetchone()
    testing = bool(trial['trial_ends_at'] and trial['trial_ends_at'] > now())
    tier = 'pro' if testing else paid['plan_code'] if paid else 'free'
    end = trial['trial_ends_at'] if testing else paid['period_end'] if paid else None
    month, reset = month_window()
    cur.execute('SELECT searches FROM precify_monthly_usage WHERE user_id=%s AND month=%s', (user_id,month))
    row = cur.fetchone()
    used = row['searches'] if row else 0
    return dict(tier=tier, status='trialing' if testing else 'active' if paid else 'free',
        validUntil=end.isoformat() if end else None, trialAvailable=not trial['trial_started_at'],
        usage=dict(used=used,limit=10 if tier=='free' else None,remaining=max(0,10-used) if tier=='free' else None,resetsAt=reset),
        features=dict(insights=tier=='pro',comparisons=tier in ('plus','pro'),unlimitedSearches=tier!='free'))


def require_feature(user_id, feature):
    with db() as cur:
        plan = plan_for(cur,user_id)
    if not plan['features'].get(feature):
        raise ApiError('plan_required',403)
    return plan


def reserve_import(user_id, key, url):
    try:
        key = str(UUID(key))
    except (ValueError,TypeError,AttributeError):
        raise ApiError('invalid_request_key') from None
    month,_ = month_window()
    with db() as cur:
        # Lock one account across devices, months and paid/free transitions.
        account(cur,user_id)
        cur.execute('SELECT user_id FROM precify_accounts WHERE user_id=%s FOR UPDATE',(user_id,))
        cur.execute('SELECT id,url_hash FROM precify_imports WHERE user_id=%s AND request_key=%s',(user_id,key))
        existing=cur.fetchone()
        if existing:
            if existing['url_hash'] != digest(url):
                raise ApiError('request_key_reused',409)
            return str(existing['id']),plan_for(cur,user_id)
        plan=plan_for(cur,user_id)
        if plan['tier']=='free' and plan['usage']['remaining']==0:
            raise ApiError('monthly_limit',429)
        cur.execute('''INSERT INTO precify_monthly_usage(user_id,month,searches) VALUES(%s,%s,1)
          ON CONFLICT(user_id,month) DO UPDATE SET searches=precify_monthly_usage.searches+1''',(user_id,month))
        import_id=str(uuid4())
        cur.execute('INSERT INTO precify_imports(id,user_id,request_key,url_hash,month) VALUES(%s,%s,%s,%s,%s)',
                    (import_id,user_id,key,digest(url),month))
        return import_id,plan_for(cur,user_id)


def check_import(user_id, import_id, url):
    try:
        import_id=str(UUID(import_id))
    except (ValueError,TypeError,AttributeError):
        raise ApiError('import_required',403) from None
    with db() as cur:
        cur.execute('SELECT id FROM precify_imports WHERE id=%s AND user_id=%s AND url_hash=%s AND created_at>NOW()-INTERVAL \'30 minutes\'',(import_id,user_id,digest(url)))
        if not cur.fetchone():
            raise ApiError('import_expired',403)


def rate_limit(key):
    bucket=now().replace(minute=(now().minute//15)*15,second=0,microsecond=0)
    with db() as cur:
        cur.execute('''INSERT INTO precify_auth_limits(key_hash,bucket) VALUES(%s,%s)
          ON CONFLICT(key_hash,bucket) DO UPDATE SET attempts=precify_auth_limits.attempts+1 RETURNING attempts''',(digest(key),bucket))
        count=cur.fetchone()['attempts']
    if count>20:
        raise ApiError('too_many_attempts',429)
