"""Dates from the official Mercado Livre description resource."""

from datetime import datetime
import re

from flask import Blueprint, jsonify, request
import requests


item_dates = Blueprint("item_dates", __name__)
ITEM_ID = re.compile(r"MLB\d{6,15}\Z")
MAX_ITEMS = 10


def date_item(item_id, created_at=None):
    value = {"id": item_id, "date": None, "createdAt": None, "source": None}
    if not isinstance(created_at, str):
        return value
    try:
        parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return value
    if parsed.tzinfo is None:
        return value
    value.update(date=created_at[:10], createdAt=created_at, source="ml_description")
    return value


@item_dates.after_request
def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@item_dates.route("/api/ext/items/created-at", methods=["POST"])
def created_at():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="invalid_json"), 400

    ids = body.get("ids")
    if ids is None:
        ids = [body.get("item_id")]
    if (not isinstance(ids, list) or not 1 <= len(ids) <= MAX_ITEMS
            or any(not isinstance(i, str) or not ITEM_ID.fullmatch(i) for i in ids)):
        return jsonify(error="invalid_item_ids", max_items=MAX_ITEMS), 400
    ids = list(dict.fromkeys(ids))

    token = body.get("access_token")
    if token is None:
        scheme, _, token = request.headers.get("Authorization", "").partition(" ")
        if scheme.lower() != "bearer":
            token = None
    if not isinstance(token, str) or not token.strip():
        return jsonify(error="access_token_required"), 401
    token = token.strip()
    if len(token) > 4096 or any(c.isspace() for c in token):
        return jsonify(error="invalid_access_token"), 400

    items = []
    for item_id in ids:
        try:
            upstream = requests.get(
                f"https://api.mercadolibre.com/items/{item_id}/description",
                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                timeout=(3, 7),
                allow_redirects=False,
            )
        except requests.Timeout:
            return jsonify(error="ml_timeout", item_id=item_id), 504
        except requests.RequestException:
            return jsonify(error="ml_unavailable", item_id=item_id), 502

        # Neither upstream bodies nor credentials are echoed or logged.
        with upstream:
            if upstream.status_code == 404:
                items.append(date_item(item_id))
                continue
            if upstream.status_code in (401, 403, 429):
                return jsonify(error="ml_request_denied", upstream_status=upstream.status_code,
                               item_id=item_id), upstream.status_code
            if upstream.status_code != 200:
                return jsonify(error="ml_unavailable", upstream_status=upstream.status_code,
                               item_id=item_id), 502
            try:
                description = upstream.json()
            except ValueError:
                return jsonify(error="ml_invalid_response", item_id=item_id), 502
            if not isinstance(description, dict):
                return jsonify(error="ml_invalid_response", item_id=item_id), 502
            # last_updated is an edit date and must never replace date_created.
            items.append(date_item(item_id, description.get("date_created")))

    return jsonify(items=items)
