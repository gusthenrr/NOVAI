"""One credential/expiry/retry boundary for seller analytics. Never returns tokens to UI."""
import re
import time
from datetime import timedelta
from precify_core import ApiError, db, now
from security_network import ml_http


def get(user_id, seller_id, path, params=None, headers=None):
    from precify_api import ml_token
    if not re.fullmatch(r'/[A-Za-z0-9_/-]+',path) or '//' in path:
        raise ApiError('invalid_ml_resource')
    for attempt in range(3):
        with db() as cur:
            cur.execute('SELECT id_ml FROM contas_mercado_livre WHERE usuario_id=%s',(user_id,))
            account=cur.fetchone()
        if not account or account['id_ml']!=seller_id: raise ApiError('ml_account_changed',409)
        token=ml_token(user_id)  # checks expiry + serializes refresh via row lock, on EVERY request
        try:
            response=ml_http.get('https://api.mercadolibre.com'+path,
                params=params,headers={**(headers or {}),'Authorization':'Bearer '+token})
        except ml_http.RequestException:
            raise ApiError('ml_unavailable',502) from None
        if response.status_code==401 and attempt==0:
            # Invalidate only the token we used; never overwrite a concurrent refresh.
            with db() as cur:
                cur.execute('UPDATE contas_mercado_livre SET expiracao_token=%s WHERE usuario_id=%s AND acess_token=%s',
                    ((now()-timedelta(seconds=1)).replace(tzinfo=None),user_id,token))
            continue
        if response.status_code in (429,500,502,503,504) and attempt<2:
            time.sleep(1+attempt);continue
        if response.status_code==401: raise ApiError('ml_reconnect_required',409)
        if response.status_code==403: raise ApiError('ml_permission_required',403)
        if response.status_code==404: raise ApiError('ml_resource_unavailable',404)
        if response.status_code==429: raise ApiError('ml_rate_limited',429)
        if not response.ok: raise ApiError('ml_http_'+str(response.status_code),502)
        try: return response.json()
        except ValueError: raise ApiError('ml_invalid_response',502) from None
    raise ApiError('ml_unavailable',502)
