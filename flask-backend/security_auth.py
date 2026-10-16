"""Shared NOVAI password policy and throttling for all login entry points."""
import re
import bcrypt
from flask import request
from precify_core import ApiError, db, digest, now

TERMS_VERSION='2026-10-15'
PASSWORD_POLICY=1
DUMMY_HASH=bcrypt.hashpw(b'non-account-check',bcrypt.gensalt())


def normalized_email(value):
    value=str(value or '').strip().lower()
    if len(value)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',value):
        raise ApiError('invalid_credentials',401)
    return value


def valid_password(value):
    return isinstance(value,str) and 8<=len(value) and len(value.encode())<=72


def validate_registration(email,name,password):
    email=normalized_email(email)
    if not isinstance(name,str) or not 2<=len(name.strip())<=100:
        raise ApiError('invalid_registration')
    if not valid_password(password): raise ApiError('invalid_password')
    return email,name.strip()


def authenticate_password(email,password):
    email=normalized_email(email)
    if not isinstance(password,str) or not 1<=len(password.encode())<=72:
        raise ApiError('invalid_credentials',401)
    bucket=now().replace(minute=(now().minute//15)*15,second=0,microsecond=0)
    key=digest('password-failures:'+email)
    origin_key=digest('password-origin-failures:'+str(request.remote_addr or 'unknown'))
    blocked=False
    user=None
    # Serialize per-account attempts across legacy routes and Precify, even in
    # separate workers. Failed attempts commit before returning their error.
    with db() as cur:
        cur.execute('SELECT pg_advisory_xact_lock(%s)',(int(key[:15],16),))
        cur.execute('DELETE FROM precify_auth_limits WHERE bucket<NOW()-INTERVAL \'1 day\'')
        cur.execute('SELECT attempts FROM precify_auth_limits WHERE key_hash=%s AND bucket=%s',(key,bucket))
        row=cur.fetchone()
        blocked=bool(row and row['attempts']>=20)
        cur.execute('SELECT attempts FROM precify_auth_limits WHERE key_hash=%s AND bucket=%s',(origin_key,bucket))
        origin=cur.fetchone()
        blocked=blocked or bool(origin and origin['attempts']>=1000)
        if not blocked:
            cur.execute('SELECT id,email,usuario,senha,password_policy_version,auth_version FROM usuarios WHERE LOWER(email)=%s',(email,))
            candidate=cur.fetchone()
            try: matches=bcrypt.checkpw(password.encode(),candidate['senha'].encode() if candidate else DUMMY_HASH)
            except (ValueError,TypeError,AttributeError): matches=False
            if candidate and matches:
                user=candidate
                cur.execute('DELETE FROM precify_auth_limits WHERE key_hash=%s',(key,))
                if valid_password(password) and candidate['password_policy_version']<PASSWORD_POLICY:
                    cur.execute('UPDATE usuarios SET password_policy_version=%s WHERE id=%s',(PASSWORD_POLICY,user['id']))
                    user['password_policy_version']=PASSWORD_POLICY
            else:
                cur.execute('''INSERT INTO precify_auth_limits(key_hash,bucket) VALUES(%s,%s)
                    ON CONFLICT(key_hash,bucket) DO UPDATE SET attempts=precify_auth_limits.attempts+1''',(key,bucket))
                cur.execute('''INSERT INTO precify_auth_limits(key_hash,bucket) VALUES(%s,%s)
                    ON CONFLICT(key_hash,bucket) DO UPDATE SET attempts=precify_auth_limits.attempts+1''',(origin_key,bucket))
    if blocked: raise ApiError('too_many_attempts',429)
    if not user: raise ApiError('invalid_credentials',401)
    return user


def account_requirements(cur,user_id):
    cur.execute('SELECT password_policy_version FROM usuarios WHERE id=%s',(user_id,))
    row=cur.fetchone()
    cur.execute('SELECT 1 FROM precify_consents WHERE user_id=%s AND purpose=%s AND version=%s',(user_id,'precify_terms',TERMS_VERSION))
    return dict(needsPasswordUpdate=not row or row['password_policy_version']<PASSWORD_POLICY,needsTerms=not bool(cur.fetchone()))


def require_ready(user_id):
    with db() as cur: needed=account_requirements(cur,user_id)
    if any(needed.values()): raise ApiError('account_update_required',409)
