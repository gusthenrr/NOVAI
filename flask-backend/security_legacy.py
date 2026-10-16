"""Identity boundaries for the existing extension and legacy Socket.IO clients."""
from datetime import datetime, timezone
from flask import request, session
from flask_jwt_extended import decode_token
from flask_socketio import disconnect
from precify_core import ApiError, db, identity, rate_limit


def decode_account_token(token):
    try:
        decoded=decode_token(token)
        user_id=int(decoded['sub'])
        with db() as cur:
            cur.execute('SELECT id,auth_version FROM usuarios WHERE id=%s',(user_id,))
            user=cur.fetchone()
            if not user or decoded.get('auth_version',0)!=user['auth_version']: raise ValueError()
        return decoded
    except Exception:
        raise ApiError('session_required',401) from None


def jwt_user(token):
    decoded=decode_account_token(token)
    return int(decoded['sub']),decoded


def token_claims(user_id):
    with db() as cur:
        cur.execute('SELECT auth_version FROM usuarios WHERE id=%s',(user_id,))
        return dict(auth_version=cur.fetchone()['auth_version'])


def legacy_user():
    if request.headers.get('X-Precify-Session'):
        return int(identity()['id'])
    authorization=request.headers.get('Authorization','')
    token=authorization[7:] if authorization.startswith('Bearer ') else request.cookies.get('__Host-token')
    user,_=jwt_user(token)
    return user


def connect_socket(auth=None):
    token=request.cookies.get('__Host-token') or (auth.get('token') if isinstance(auth,dict) else None)
    user,decoded=jwt_user(token)
    session['novai_socket_user']=user
    session['novai_socket_exp']=decoded.get('exp',0)
    session['novai_socket_version']=decoded.get('auth_version',0)
    return user


def socket_user():
    user=session.get('novai_socket_user')
    if not user or session.get('novai_socket_exp',0)<=datetime.now(timezone.utc).timestamp():
        disconnect()
        raise ApiError('session_expired',401)
    with db() as cur:
        cur.execute('SELECT auth_version FROM usuarios WHERE id=%s',(user,))
        row=cur.fetchone()
    if not row or row['auth_version']!=session.get('novai_socket_version'):
        disconnect()
        raise ApiError('session_expired',401)
    return int(user)


def account_ml_token(user_id):
    from precify_api import ml_token
    return ml_token(user_id)


def limit_operation(name,user_id):
    rate_limit('legacy:'+name+':'+str(user_id))
