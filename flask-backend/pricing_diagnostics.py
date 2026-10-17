"""Bounded, credential-redacted diagnostics for calculator requests only."""
from decimal import Decimal
from functools import wraps
import json
import logging
import math
import re
from time import perf_counter
from uuid import uuid4

from flask import current_app, g, has_request_context, request

logger = logging.getLogger("novai.pricing")
logger.setLevel(logging.INFO)
logger.propagate = False
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)

SECRET_KEY = re.compile(r"token|authorization|cookie|password|senha|secret|session|apikey|credential", re.I)
TOKEN = re.compile(r"(?:APP_USR-|TEST-)[A-Za-z0-9_-]+|Bearer\s+[^\s\"<>]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", re.I)


def redact(value, secrets=(), depth=0):
    if depth > 7:
        return "[DEPTH LIMIT]"
    if isinstance(value, dict):
        result = {}
        for key, item in list(value.items())[:64]:
            key = str(key)
            label = redact(key, secrets, depth + 1)
            sensitive = SECRET_KEY.search(key.replace("_", "").replace("-", ""))
            presence = key.endswith("_present") and isinstance(item, bool)
            result[label] = "[REDACTED]" if sensitive and not presence else redact(item, secrets, depth + 1)
        return result
    if isinstance(value, (list, tuple)):
        return [redact(item, secrets, depth + 1) for item in value[:64]]
    if isinstance(value, str):
        # Replace actual credentials even when an upstream error echoes one in its message.
        for secret in secrets:
            if isinstance(secret, str) and secret:
                value = value.replace(secret, "[REDACTED]")
        return TOKEN.sub("[REDACTED]", value)[:2048]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float) and not math.isfinite(value):
        return "[NONFINITE]"
    if value is None or isinstance(value, (int, float, bool)):
        return value
    return "[UNSUPPORTED TYPE]"


INPUT_FIELDS = {
    "precoVenda", "custoProduto", "custoVariavel", "aliquotaImpostoPct", "tipoAnuncio",
    "freteGratis", "envioFull", "envioFlex", "pesoGramas", "alturaCm", "larguraCm",
    "comprimentoCm", "reputacao", "categoryId", "sellerId", "nome", "logisticType",
    "comparison", "access_token",
}


def diagnostic_body():
    if request.content_length is not None and request.content_length <= 16384:
        body = request.get_json(silent=True)
        if isinstance(body, dict):
            return {key: value for key, value in body.items() if key in INPUT_FIELDS}
    return None


def pricing_log(event, details, token=None):
    if not has_request_context() or not getattr(g, "pricing_diagnostic_id", None):
        return
    secrets = [token, request.headers.get("Authorization", "").partition(" ")[2]]
    body = diagnostic_body()
    if isinstance(body, dict):
        secrets.extend(v for k, v in body.items() if SECRET_KEY.search(str(k)) and isinstance(v, str))
    entry = dict(event=event, diagnostic_id=g.pricing_diagnostic_id, **redact(details, secrets))
    text = json.dumps(entry, ensure_ascii=True, allow_nan=False)
    if len(text) > 24576:
        entry = dict(event=event, diagnostic_id=g.pricing_diagnostic_id,
                     details_omitted="log_size_limit")
        text = json.dumps(entry)
    logger.info("[pricing] %s", text)


def diagnose_pricing(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        previous = getattr(g, "pricing_diagnostic_id", None)
        g.pricing_diagnostic_id = uuid4().hex
        started = perf_counter()
        try:
            pricing_log("calculator_request", {"body": diagnostic_body(),
                        "authorization_present": bool(request.headers.get("Authorization"))})
            try:
                response = current_app.make_response(function(*args, **kwargs))
            except Exception as error:
                # Exception messages can include credentials or whole URLs.
                pricing_log("calculator_exception", {"exception_type": type(error).__name__})
                raise
            pricing_log("calculator_response", {"http_status": response.status_code,
                        "elapsed_ms": round((perf_counter() - started) * 1000),
                        "body": response.get_json(silent=True)})
            response.headers["X-Pricing-Diagnostic-Id"] = g.pricing_diagnostic_id
            return response
        finally:
            g.pricing_diagnostic_id = previous
    return wrapped
