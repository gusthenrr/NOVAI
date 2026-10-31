"""Bounded lookup of listing dates. No credentials or upstream bodies are returned."""
from concurrent.futures import ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone
import re
from time import monotonic

MAX_ITEMS = 60
# Shared by requests, so simultaneous browser tabs cannot create unbounded workers.
_WORKERS = ThreadPoolExecutor(max_workers=6, thread_name_prefix='novai-dates')


def normalize_ids(value):
    if (not isinstance(value, list) or not 1 <= len(value) <= MAX_ITEMS
            or any(not isinstance(i, str) or not re.fullmatch(r'MLB\d{6,15}', i) for i in value)):
        raise ValueError('invalid_item_ids')
    return list(dict.fromkeys(value))


def valid_timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})', value):
        return None
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if datetime(2000, 1, 1, tzinfo=timezone.utc) <= date <= datetime.now(timezone.utc) + timedelta(days=1):
            return value
    except ValueError:
        pass
    return None


def empty(item_id, status='unknown'):
    return dict(id=item_id, createdAt=None, source=None, status=status)


def lookup(item_id, fetch, deadline):
    if monotonic() >= deadline:
        return empty(item_id, 'unavailable')
    status, data = fetch('/items/' + item_id, {'attributes': 'id,date_created'})
    iso = valid_timestamp(data.get('date_created')) if data and data.get('id') == item_id else None
    if status == 200 and iso:
        return dict(id=item_id, createdAt=iso, source='ml_item', status='ready')
    if status in (401, 429) or monotonic() >= deadline:
        return empty(item_id, 'unavailable')
    # The description is a separate resource; preserve its source explicitly.
    status, data = fetch('/items/' + item_id + '/description', None)
    if status == 404:
        return empty(item_id)
    if status != 200:
        return empty(item_id, 'unavailable')
    iso = valid_timestamp(data.get('date_created')) if data else None
    return dict(id=item_id, createdAt=iso, source='ml_description', status='ready') if iso else empty(item_id)


def lookup_batch(ids, fetch, timeout=28):
    """Return a result for every requested ID, including failures and deadline expiry."""
    deadline = monotonic() + timeout
    futures = {item_id: _WORKERS.submit(lookup, item_id, fetch, deadline) for item_id in ids}
    wait(futures.values(), timeout=max(0, deadline - monotonic()))
    results = []
    for item_id, future in futures.items():
        if not future.done():
            future.cancel()  # Running HTTP requests retain their own short timeout.
            results.append(empty(item_id, 'unavailable'))
            continue
        try:
            results.append(future.result())
        except Exception:
            # Do not surface exceptions containing upstream URLs, bodies or secrets.
            results.append(empty(item_id, 'unavailable'))
    return results
