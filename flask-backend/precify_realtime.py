"""Private account notifications. Entitlements are always read through the API."""
import re
import secrets
from datetime import timedelta

from flask import current_app, request
from flask_socketio import join_room

from precify_core import ApiError, db, digest, identity, now

NAMESPACE='/precify'
PLAN_CHANGED='precify:plan-changed'


def ticket():
    user=identity()
    value=secrets.token_urlsafe(32)
    with db() as cur:
        cur.execute('DELETE FROM precify_socket_tickets WHERE expires_at<=NOW()')
        cur.execute('''INSERT INTO precify_socket_tickets(ticket_hash,session_hash,expires_at)
          SELECT %s,token_hash,%s FROM precify_sessions
          WHERE token_hash=%s AND user_id=%s AND revoked_at IS NULL AND expires_at>NOW()''',
          (digest(value),now()+timedelta(seconds=60),digest(request.headers['X-Precify-Session']),user['id']))
        if not cur.rowcount:
            raise ApiError('session_expired',401)
    return dict(ticket=value,expiresIn=60)


def register_realtime(app,socketio):
    app.extensions['precify_realtime']=socketio

    @socketio.on('connect',namespace=NAMESPACE)
    def connect(auth=None):
        value=auth.get('ticket') if isinstance(auth,dict) else None
        if not isinstance(value,str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}',value):
            return False
        with db() as cur:
            cur.execute('''DELETE FROM precify_socket_tickets t USING precify_sessions s
              WHERE t.ticket_hash=%s AND t.session_hash=s.token_hash AND t.expires_at>NOW()
              AND s.revoked_at IS NULL AND s.expires_at>NOW()
              RETURNING s.user_id,s.token_hash''',(digest(value),))
            row=cur.fetchone()
        if not row:
            return False
        # Account and session come from the database, never from client-supplied IDs.
        join_room('precify-user:'+str(row['user_id']))
        join_room('precify-session:'+row['token_hash'])


def notify_plan_changed(user_id):
    """Call only after the billing transaction commits. Never send credentials/data."""
    socketio=current_app.extensions.get('precify_realtime')
    if socketio:
        try:
            socketio.emit(PLAN_CHANGED,{},to='precify-user:'+str(user_id),namespace=NAMESPACE)
        except Exception:
            # A notification outage cannot roll back a verified payment. Reconnect and
            # foreground refresh recover state from the authenticated HTTP endpoint.
            current_app.logger.warning('Precify realtime notification unavailable')


def disconnect_session(session_hash):
    socketio=current_app.extensions.get('precify_realtime')
    if socketio:
        participants=list(socketio.server.manager.get_participants(NAMESPACE,'precify-session:'+session_hash))
        for sid,_ in participants:
            socketio.server.disconnect(sid,namespace=NAMESPACE)
