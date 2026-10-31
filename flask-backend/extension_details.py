"""Public item facts only. Never return addresses, coordinates or upstream bodies."""
from concurrent.futures import ThreadPoolExecutor, wait
from time import monotonic
import re

_WORKERS = ThreadPoolExecutor(max_workers=6, thread_name_prefix='novai-details')
_RANGES = {1: (1, 50), 50: (51, 100), 100: (101, 150), 150: (151, 200),
           200: (201, 250), 250: (251, 500), 500: (501, 5000),
           5000: (5001, 50000), 50000: (50001, 99999)}


def text(value, key='name'):
    value = value.get(key) if isinstance(value, dict) else value
    if not isinstance(value, str): return None
    value = re.sub(r'\s+', ' ', value).strip()
    return value if 0 < len(value) <= 100 and not re.search(r'[<>\x00-\x1f]', value) else None


def location(value):
    if not isinstance(value, dict): return None
    result = dict(city=text(value.get('city')), state=text(value.get('state')),
                  stateId=text(value.get('state'), 'id') or text(value.get('stateId')),
                  country=text(value.get('country')))
    return dict(**result, source='ml_item') if result['city'] or result['state'] else None


def stock(value, owned=False):
    if type(value) is not int or not 0 <= value <= 100000000: return None
    if owned or value == 0:
        return dict(min=value, max=value, precision='exact', source='ml_item')
    if value in _RANGES:
        low, high = _RANGES[value]
        return dict(min=low, max=high, precision='range', source='ml_item')
    return dict(min=value, max=None, precision='reference', source='ml_item')


def empty(item_id, status='unavailable'):
    return dict(id=item_id, location=None, stock=None, status=status)


def lookup(item_id, fetch, deadline, include_stock=False, owner_id=None):
    if monotonic() >= deadline: return empty(item_id)
    fields = 'id,seller_address' + (',seller_id,available_quantity' if include_stock else '')
    status, data = fetch('/items/' + item_id, {'attributes': fields})
    if status not in (200, 206) or not data or data.get('id') != item_id:
        return empty(item_id, 'unknown' if status == 404 else 'unavailable')
    place = location(data.get('seller_address'))
    owned = owner_id is not None and str(data.get('seller_id')) == str(owner_id)
    quantity = stock(data.get('available_quantity'), owned) if include_stock else None
    return dict(id=item_id, location=place, stock=quantity,
                status='ready' if place or quantity else 'unknown')


def lookup_batch(ids, fetch, include_stock=False, owner_id=None, timeout=28):
    deadline = monotonic() + timeout
    futures = {i: _WORKERS.submit(lookup, i, fetch, deadline, include_stock, owner_id) for i in ids}
    wait(futures.values(), timeout=max(0, deadline - monotonic()))
    results = []
    for item_id, future in futures.items():
        if not future.done():
            future.cancel()
            results.append(empty(item_id))
        else:
            try: results.append(future.result())
            except Exception: results.append(empty(item_id))
    return results
