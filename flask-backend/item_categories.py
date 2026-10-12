"""Public category lookup through the official Mercado Livre resource."""

from collections import OrderedDict
import re
import threading
import time

from flask import Blueprint, jsonify
import requests


item_categories = Blueprint("item_categories", __name__)
CATEGORY_ID = re.compile(r"MLB\d{1,15}\Z")
CACHE_TTL = 600
CACHE_LIMIT = 512
_cache = OrderedDict()
_cache_lock = threading.Lock()


def normalize_category(data, category_id):
    if not isinstance(data, dict) or data.get("id") != category_id:
        raise ValueError("invalid_category")
    name = data.get("name")
    path = data.get("path_from_root")
    if (not isinstance(name, str) or not name.strip() or len(name) > 300
            or not isinstance(path, list) or not 1 <= len(path) <= 30):
        raise ValueError("invalid_category")
    for node in path:
        if (not isinstance(node, dict) or not isinstance(node.get("id"), str)
                or not CATEGORY_ID.fullmatch(node["id"])
                or not isinstance(node.get("name"), str) or not node["name"].strip()
                or len(node["name"]) > 300):
            raise ValueError("invalid_category_path")
    if path[-1]["id"] != category_id:
        raise ValueError("category_path_mismatch")
    return {"id": category_id, "name": name.strip(),
            "path": [node["name"].strip() for node in path],
            "rootId": path[0]["id"], "rootName": path[0]["name"].strip()}


@item_categories.route("/api/ext/categories/<category_id>", methods=["GET"])
def category(category_id):
    if not CATEGORY_ID.fullmatch(category_id):
        return jsonify(error="invalid_category_id"), 400
    now = time.monotonic()
    with _cache_lock:
        cached = _cache.get(category_id)
        if cached and now - cached[0] < CACHE_TTL:
            _cache.move_to_end(category_id)
            return jsonify(cached[1])
        _cache.pop(category_id, None)
    try:
        upstream = requests.get(
            f"https://api.mercadolibre.com/categories/{category_id}",
            headers={"Accept": "application/json"}, timeout=(3, 7),
            allow_redirects=False,
        )
    except requests.Timeout:
        return jsonify(error="ml_timeout"), 504
    except requests.RequestException:
        return jsonify(error="ml_unavailable"), 502
    with upstream:
        if upstream.status_code in (401, 403, 404, 429):
            return jsonify(error="ml_category_unavailable", upstream_status=upstream.status_code), upstream.status_code
        if upstream.status_code != 200:
            return jsonify(error="ml_unavailable"), 502
        if len(upstream.content) > 1024 * 1024:
            return jsonify(error="ml_invalid_response"), 502
        try:
            result = normalize_category(upstream.json(), category_id)
        except (ValueError, TypeError):
            return jsonify(error="ml_invalid_response"), 502
    with _cache_lock:
        _cache[category_id] = (time.monotonic(), result)
        _cache.move_to_end(category_id)
        while len(_cache) > CACHE_LIMIT:
            _cache.popitem(last=False)
    return jsonify(result)


@item_categories.after_request
def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response
