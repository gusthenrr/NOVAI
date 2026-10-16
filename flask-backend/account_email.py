"""One-use email actions. Missing SMTP fails explicitly without fake delivery."""
from datetime import timedelta
from email.message import EmailMessage
import os
import re
import secrets
import smtplib
import ssl

import bcrypt
from flask import Blueprint,jsonify,request
from precify_core import ApiError,db,digest,identity,now,rate_limit
from security_auth import normalized_email,valid_password,PASSWORD_POLICY

email_api=Blueprint('precify_email',__name__,url_prefix='/api/precify/auth')


def configured():
    return all(os.environ.get(k) for k in ('SMTP_HOST','SMTP_USERNAME','SMTP_PASSWORD','SMTP_FROM'))


def deliver(recipient,code,purpose):
    if not configured(): raise ApiError('email_not_configured',503)
    message=EmailMessage()
    message['From']=os.environ['SMTP_FROM'];message['To']=recipient
    message['Subject']='Precify — '+('recuperação de senha' if purpose=='reset' else 'confirmação de e-mail')
    message.set_content('Use este código no aplicativo Precify:\n\n'+code+'\n\nEle expira em 20 minutos e só pode ser usado uma vez. Se você não solicitou, ignore esta mensagem.')
    try:
        port=int(os.environ.get('SMTP_PORT','587'))
        context=ssl.create_default_context()
        if port==465: conn=smtplib.SMTP_SSL(os.environ['SMTP_HOST'],port,timeout=10,context=context)
        else:
            conn=smtplib.SMTP(os.environ['SMTP_HOST'],port,timeout=10)
            conn.starttls(context=context)
        with conn:
            conn.login(os.environ['SMTP_USERNAME'],os.environ['SMTP_PASSWORD'])
            conn.send_message(message)
    except (OSError,smtplib.SMTPException,ValueError):
        raise ApiError('email_unavailable',503) from None


@email_api.errorhandler(ApiError)
def error_response(error): return jsonify(error=error.code),error.status


@email_api.after_request
def private(response):
    response.headers['Cache-Control']='no-store'
    return response


@email_api.get('/email/status')
def status(): return jsonify(available=configured())


def issue(purpose,user):
    rate_limit('email-action:'+str(user['id'])+':'+purpose,limit=3)
    code=secrets.token_urlsafe(24)
    with db() as cur:
        cur.execute('DELETE FROM precify_email_actions WHERE expires_at<NOW()')
        cur.execute('INSERT INTO precify_email_actions(token_hash,user_id,purpose,email,expires_at) VALUES(%s,%s,%s,%s,%s)',(digest(code),user['id'],purpose,user['email'],now()+timedelta(minutes=20)))
    try: deliver(user['email'],code,purpose)
    except ApiError:
        with db() as cur: cur.execute('DELETE FROM precify_email_actions WHERE token_hash=%s',(digest(code),))
        raise


@email_api.post('/password/request')
def request_reset():
    if not configured(): raise ApiError('email_not_configured',503)
    data=request.get_json(silent=True) or {}
    if not isinstance(data,dict): raise ApiError('invalid_json')
    email=normalized_email(data.get('email'))
    rate_limit('email-reset:'+email,limit=3)
    with db() as cur:
        cur.execute('SELECT id,email FROM usuarios WHERE LOWER(email)=%s',(email,));user=cur.fetchone()
    if user: issue('reset',user)
    return jsonify(ok=True) # Identical for known and unknown addresses.


@email_api.post('/email/request')
def request_verification():
    user=identity(allow_incomplete=True)
    if not configured(): raise ApiError('email_not_configured',503)
    issue('verify',user)
    return jsonify(ok=True)


def consume(purpose):
    data=request.get_json(silent=True) or {}
    if not isinstance(data,dict): raise ApiError('invalid_json')
    code=data.get('code')
    if not isinstance(code,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',code): raise ApiError('invalid_email_code')
    user=identity(allow_incomplete=True) if purpose=='verify' else None
    password=data.get('password')
    if purpose=='reset' and not valid_password(password): raise ApiError('invalid_password')
    with db() as cur:
        cur.execute('''SELECT a.*,u.email AS current_email FROM precify_email_actions a JOIN usuarios u ON u.id=a.user_id
            WHERE a.token_hash=%s AND a.purpose=%s AND a.consumed_at IS NULL AND a.expires_at>NOW() FOR UPDATE OF a,u''',(digest(code),purpose))
        row=cur.fetchone()
        if not row or row['email']!=row['current_email'] or (user and row['user_id']!=user['id']): raise ApiError('invalid_email_code')
        cur.execute('UPDATE precify_email_actions SET consumed_at=NOW() WHERE user_id=%s AND purpose=%s',(row['user_id'],purpose))
        if purpose=='verify': cur.execute('UPDATE usuarios SET email_verified_at=NOW() WHERE id=%s',(row['user_id'],))
        else:
            cur.execute('UPDATE usuarios SET senha=%s,password_policy_version=%s,auth_version=auth_version+1 WHERE id=%s',
                (bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode(),PASSWORD_POLICY,row['user_id']))
            cur.execute('UPDATE precify_sessions SET revoked_at=NOW() WHERE user_id=%s',(row['user_id'],))
    from precify_realtime import disconnect_account
    if purpose=='reset': disconnect_account(row['user_id'])
    return jsonify(ok=True)


@email_api.post('/password/reset')
def reset(): return consume('reset')


@email_api.post('/email/confirm')
def confirm(): return consume('verify')
