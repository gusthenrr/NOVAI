"""Seller shipping quote and selling fees from fixed official ML resources.

Credentials live only in this request. Unknown costs remain null, never zero.
"""
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
import re

from flask import Blueprint, jsonify, request
import requests

pricing_margin = Blueprint("pricing_margin", __name__)
BASE = "https://api.mercadolibre.com"
CATEGORY = re.compile(r"MLB\d{1,15}\Z")
SELLER = re.compile(r"[1-9]\d{0,19}\Z")
CENT = Decimal("0.01")
REPUTATIONS = {"verde": "green", "verde-claro": "light_green", "amarela": "yellow",
               "laranja": "orange", "vermelha": "red", "sem-reputacao": None}
LOGISTICS = {"fulfillment", "cross_docking", "xd_drop_off", "drop_off", "self_service", "not_specified"}


def number(value, minimum=0, maximum=9999999, required=True):
    if value is None and not required:
        return Decimal(0)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("number_required")
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        raise ValueError("invalid_number") from None
    if not result.is_finite() or not minimum <= result <= maximum:
        raise ValueError("number_out_of_range")
    return result


def validate(body):
    if not isinstance(body, dict):
        raise ValueError("invalid_json")
    data = {}
    for key, minimum, maximum in [("precoVenda", 0.01, 9999999), ("custoProduto", 0, 9999999),
                                  ("aliquotaImpostoPct", 0, 100), ("pesoGramas", 0.01, 1000000),
                                  ("alturaCm", 0.01, 1000), ("larguraCm", 0.01, 1000),
                                  ("comprimentoCm", 0.01, 1000)]:
        try:
            data[key] = number(body.get(key), Decimal(str(minimum)), maximum)
        except ValueError:
            raise ValueError(key) from None
    data["custoVariavel"] = number(body.get("custoVariavel"), required=False)
    for key in ["freteGratis", "envioFull", "envioFlex"]:
        if not isinstance(body.get(key), bool):
            raise ValueError(key)
        data[key] = body[key]
    if data["envioFull"] and data["envioFlex"]:
        raise ValueError("envioFull_envioFlex")
    data["tipoAnuncio"] = body.get("tipoAnuncio")
    if data["tipoAnuncio"] not in ("classico", "premium"):
        raise ValueError("tipoAnuncio")
    data["categoryId"] = body.get("categoryId")
    if not isinstance(data["categoryId"], str) or not CATEGORY.fullmatch(data["categoryId"]):
        raise ValueError("categoryId")
    data["reputacao"] = body.get("reputacao")
    if data["reputacao"] not in REPUTATIONS:
        raise ValueError("reputacao")
    seller = body.get("sellerId")
    if seller is not None and (not isinstance(seller, str) or not SELLER.fullmatch(seller)):
        raise ValueError("sellerId")
    data["sellerId"] = seller
    name = body.get("nome")
    if name is not None and (not isinstance(name, str) or len(name) > 512):
        raise ValueError("nome")
    # Full/Flex take precedence; ordinary ME2 can specify its actual workflow.
    data["logistic_type"] = ("fulfillment" if data["envioFull"] else "self_service" if data["envioFlex"]
                             else body.get("logisticType", "xd_drop_off"))
    if data["logistic_type"] not in LOGISTICS:
        raise ValueError("logisticType")
    if not (data["envioFull"] or data["envioFlex"]) and data["logistic_type"] in ("fulfillment", "self_service"):
        raise ValueError("logisticType_flags")
    return data


class UpstreamError(Exception):
    def __init__(self, code):
        self.code = code


def get_ml(path, token, params=None):
    try:
        upstream = requests.get(BASE + path, params=params,
                                headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
                                timeout=(3, 7), allow_redirects=False)
        with upstream:
            if upstream.status_code != 200:
                raise UpstreamError(str(upstream.status_code))
            if len(upstream.content) > 1024 * 1024:
                raise UpstreamError("invalid_response")
            try:
                return upstream.json()
            except ValueError:
                raise UpstreamError("invalid_response") from None
    except requests.Timeout:
        raise UpstreamError("timeout") from None
    except requests.RequestException:
        raise UpstreamError("unavailable") from None


def money(value):
    return float(value.quantize(CENT, rounding=ROUND_HALF_UP)) if value is not None else None


@pricing_margin.after_request
def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@pricing_margin.route("/api/ext/pricing/margin", methods=["POST"])
def margin():
    if request.content_length and request.content_length > 16384:
        return jsonify(error="request_too_large"), 413
    body = request.get_json(silent=True)
    try:
        data = validate(body)
    except (ValueError, TypeError) as error:
        field = str(error) if isinstance(error, ValueError) else "invalid_json"
        return jsonify(error="validation", field=field), 400
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if not token and isinstance(body.get("access_token"), str):
        scheme, token = "Bearer", body["access_token"]
    if scheme.lower() != "bearer" or not token.strip():
        return jsonify(error="access_token_required"), 401
    token = token.strip()
    if len(token) > 8192 or any(c.isspace() for c in token):
        return jsonify(error="invalid_access_token"), 400
    try:
        me = get_ml("/users/me", token)
        owner = str(me.get("id", "")) if isinstance(me, dict) else ""
        if not SELLER.fullmatch(owner) or me.get("site_id") != "MLB":
            return jsonify(error="ml_account_invalid"), 502
    except UpstreamError as error:
        status = int(error.code) if error.code in ("401", "403", "429") else 504 if error.code == "timeout" else 502
        return jsonify(error="ml_account_unavailable", upstream_status=error.code), status
    if data["sellerId"] and data["sellerId"] != owner:
        return jsonify(error="seller_session_mismatch"), 400

    listing = "gold_special" if data["tipoAnuncio"] == "classico" else "gold_pro"
    logistic = data["logistic_type"]
    shipping, fees, billable = None, None, None
    missing = []
    if logistic == "not_specified":
        missing.append("frete_modalidade_nao_suportada")
    else:
        dimensions = "x".join(str(int(data[key].to_integral_value(rounding=ROUND_CEILING)))
                              for key in ["alturaCm", "larguraCm", "comprimentoCm"])
        dimensions += "," + str(int(data["pesoGramas"].to_integral_value(rounding=ROUND_CEILING)))
        params = {"dimensions": dimensions, "item_price": money(data["precoVenda"]),
                  "category_id": data["categoryId"], "listing_type_id": listing, "condition": "new",
                  "currency_id": "BRL", "mode": "me2", "logistic_type": logistic,
                  "free_shipping": str(data["freteGratis"]).lower(), "verbose": "true"}
        reputation = REPUTATIONS[data["reputacao"]]
        if reputation:
            params["reputation"] = reputation
        try:
            quote = get_ml(f"/users/{owner}/shipping_options/free", token, params)
            country = quote["coverage"]["all_country"]
            if country.get("currency_id") != "BRL":
                raise ValueError("currency")
            shipping = number(country.get("list_cost"))
            try:
                billable = int(number(country.get("billable_weight"), 0, 1000000))
            except ValueError:
                pass
        except UpstreamError as error:
            if error.code == "401":
                return jsonify(error="ml_token_expired"), 401
            missing.append("frete_" + error.code)
        except (ValueError, TypeError, KeyError):
            missing.append("frete_invalid_response")

    params = {"price": money(data["precoVenda"]), "category_id": data["categoryId"],
              "listing_type_id": listing, "currency_id": "BRL",
              "logistic_type": logistic, "shipping_mode": "me2" if logistic != "not_specified" else "not_specified"}
    if billable is not None:
        params["billable_weight"] = billable
    try:
        rows = get_ml("/sites/MLB/listing_prices", token, params)
        candidates = rows if isinstance(rows, list) else [rows]
        matching = [row for row in candidates if isinstance(row, dict) and row.get("listing_type_id") == listing]
        if len(matching) != 1 or matching[0].get("currency_id") != "BRL":
            raise ValueError("listing")
        # sale_fee_amount already contains its fixed component; do not add it again.
        fees = number(matching[0].get("sale_fee_amount"))
    except UpstreamError as error:
        if error.code == "401":
            return jsonify(error="ml_token_expired"), 401
        missing.append("tarifas_" + error.code)
    except (ValueError, TypeError):
        missing.append("tarifas_invalid_response")

    tax = (data["precoVenda"] * data["aliquotaImpostoPct"] / 100).quantize(CENT, rounding=ROUND_HALF_UP)
    costs = (data["custoProduto"] + data["custoVariavel"]).quantize(CENT, rounding=ROUND_HALF_UP)
    contribution = None
    if shipping is not None and fees is not None:
        contribution = data["precoVenda"].quantize(CENT, rounding=ROUND_HALF_UP) - Decimal(str(money(shipping))) - Decimal(str(money(fees))) - tax - costs
    percent = contribution / data["precoVenda"] * 100 if contribution is not None else None
    return jsonify(frete=money(shipping), tarifas=money(fees), impostos=money(tax), custos=money(costs),
                   margemContribuicao=money(contribution), margemPct=money(percent), missing=missing)
