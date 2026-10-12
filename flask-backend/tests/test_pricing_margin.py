import os
import sys
import unittest
from unittest.mock import MagicMock, patch

from flask import Flask
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import pricing_margin as module


class PricingTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(module.pricing_margin)
        self.client = app.test_client()
        self.url = "/api/ext/pricing/margin"
        self.headers = {"Authorization": "Bearer test-credential"}
        self.payload = {"precoVenda": 100, "custoProduto": 40, "aliquotaImpostoPct": 4,
                        "tipoAnuncio": "classico", "freteGratis": True, "envioFull": True,
                        "envioFlex": False, "pesoGramas": 300, "alturaCm": 5, "larguraCm": 15,
                        "comprimentoCm": 20, "reputacao": "verde", "categoryId": "MLB9600"}

    def response(self, body, status=200):
        result = MagicMock(status_code=status, content=b"{}")
        result.__enter__.return_value = result
        result.json.return_value = body
        return result

    def replies(self, shipping=None, fees=None):
        return [self.response({"id": 123456, "site_id": "MLB"}),
                self.response(shipping if shipping is not None else {"coverage": {"all_country": {"list_cost": 8.15, "currency_id": "BRL", "billable_weight": 300, "discount": {"rate": 0.3}}}}),
                self.response(fees if fees is not None else {"listing_type_id": "gold_special", "currency_id": "BRL", "sale_fee_amount": 15, "sale_fee_details": {"fixed_fee": 6}})]

    def post(self, payload=None, headers=None):
        return self.client.post(self.url, json=self.payload if payload is None else payload,
                                headers=self.headers if headers is None else headers)

    @patch("pricing_margin.requests.get")
    def test_official_quote_and_fee_fixed_component_is_not_counted_twice(self, get):
        get.side_effect = self.replies()
        response = self.post({**self.payload, "custoVariavel": 2, "nome": "Cabo"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"frete": 8.15, "tarifas": 15, "impostos": 4, "custos": 42,
                                         "margemContribuicao": 30.85, "margemPct": 30.85, "missing": []})
        quote = get.call_args_list[1]
        self.assertEqual(quote.args[0], module.BASE + "/users/123456/shipping_options/free")
        self.assertEqual(quote.kwargs["params"], {"dimensions": "5x15x20,300", "item_price": 100,
            "category_id": "MLB9600", "listing_type_id": "gold_special", "condition": "new",
            "currency_id": "BRL", "mode": "me2", "logistic_type": "fulfillment", "free_shipping": "true", "verbose": "true", "reputation": "green"})
        self.assertEqual(get.call_args_list[2].kwargs["params"]["billable_weight"], 300)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        for call in get.call_args_list:
            self.assertFalse(call.kwargs["allow_redirects"])
            self.assertEqual(call.kwargs["headers"]["Authorization"], "Bearer test-credential")
        self.assertNotIn("test-credential", response.get_data(as_text=True))

    @patch("pricing_margin.requests.get")
    def test_premium_free_shipping_false_and_conservative_package_rounding(self, get):
        get.side_effect = self.replies(fees=[{"listing_type_id": "gold_pro", "currency_id": "BRL", "sale_fee_amount": 20}])
        response = self.post({**self.payload, "tipoAnuncio": "premium", "freteGratis": False,
                              "pesoGramas": 300.1, "alturaCm": 5.1})
        self.assertEqual(response.status_code, 200)
        params = get.call_args_list[1].kwargs["params"]
        self.assertEqual(params["dimensions"], "6x15x20,301")
        self.assertEqual(params["listing_type_id"], "gold_pro")
        self.assertEqual(params["free_shipping"], "false")
        self.assertEqual(response.json["margemContribuicao"], 27.85)

    @patch("pricing_margin.requests.get")
    def test_failure_of_either_component_keeps_partial_margin_null(self, get):
        for index, name in [(1, "frete_403"), (2, "tarifas_403")]:
            replies = self.replies()
            replies[index] = self.response({"secret": "do_not_echo"}, 403)
            get.side_effect = replies
            response = self.post()
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(response.json["frete" if index == 1 else "tarifas"])
            self.assertIsNone(response.json["margemContribuicao"])
            self.assertIsNone(response.json["margemPct"])
            self.assertEqual(response.json["missing"], [name])
            self.assertNotIn("do_not_echo", response.get_data(as_text=True))

    @patch("pricing_margin.requests.get")
    def test_zero_quote_is_valid_and_negative_margin_is_preserved(self, get):
        get.side_effect = self.replies(shipping={"coverage": {"all_country": {"list_cost": 0, "currency_id": "BRL"}}})
        response = self.post({**self.payload, "custoProduto": 110})
        self.assertEqual(response.json["frete"], 0)
        self.assertEqual(response.json["margemContribuicao"], -29)
        self.assertEqual(response.json["missing"], [])

    @patch("pricing_margin.requests.get")
    def test_invalid_payloads_never_reach_ml(self, get):
        for key, value in [("precoVenda", 0), ("custoProduto", True), ("aliquotaImpostoPct", 101),
                           ("pesoGramas", float("nan")), ("alturaCm", -1), ("categoryId", "MLA9600"),
                           ("envioFlex", True), ("freteGratis", "true"), ("tipoAnuncio", "unknown"),
                           ("reputacao", "unknown"), ("sellerId", "ID_DA_CONTA_EM_SESSAO"),
                           ("nome", "x" * 513)]:
            self.assertEqual(self.post({**self.payload, key: value}).status_code, 400)
        self.assertEqual(self.post(headers={}).status_code, 401)
        self.assertEqual(self.client.post(self.url, data="x" * 17000).status_code, 413)
        get.assert_not_called()

    @patch("pricing_margin.requests.get")
    def test_seller_must_match_authenticated_account(self, get):
        get.return_value = self.replies()[0]
        response = self.post({**self.payload, "sellerId": "999999"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json["error"], "seller_session_mismatch")
        self.assertEqual(get.call_count, 1)

    @patch("pricing_margin.requests.get")
    def test_account_failure_and_expired_quote_token_are_not_hidden(self, get):
        for code in [401, 403, 429, 500, 302]:
            get.side_effect = None
            get.return_value = self.response({}, code)
            self.assertEqual(self.post().status_code, code if code in [401, 403, 429] else 502)
        get.side_effect = [self.replies()[0], self.response({}, 401)]
        self.assertEqual(self.post().status_code, 401)
        get.side_effect = requests.Timeout()
        self.assertEqual(self.post().status_code, 504)

    @patch("pricing_margin.requests.get")
    def test_invalid_currency_or_missing_amount_does_not_become_zero(self, get):
        for shipping in [{}, {"coverage": {"all_country": {"currency_id": "BRL"}}},
                         {"coverage": {"all_country": {"currency_id": "ARS", "list_cost": 8}}},
                         {"coverage": {"all_country": {"currency_id": "BRL", "list_cost": True}}}]:
            get.side_effect = self.replies(shipping=shipping)
            self.assertEqual(self.post().json["missing"], ["frete_invalid_response"])
        for fees in [{}, {"listing_type_id": "gold_pro", "currency_id": "BRL", "sale_fee_amount": 15},
                     {"listing_type_id": "gold_special", "currency_id": "ARS", "sale_fee_amount": 15}]:
            get.side_effect = self.replies(fees=fees)
            self.assertEqual(self.post().json["missing"], ["tarifas_invalid_response"])

    @patch("pricing_margin.requests.get")
    def test_logistics_maps_flex_and_own_shipping_is_not_faked(self, get):
        get.side_effect = self.replies()
        self.post({**self.payload, "envioFull": False, "envioFlex": True})
        self.assertEqual(get.call_args_list[1].kwargs["params"]["logistic_type"], "self_service")
        get.reset_mock()
        get.side_effect = [self.replies()[0], self.replies()[2]]
        response = self.post({**self.payload, "envioFull": False, "logisticType": "not_specified"})
        self.assertEqual(response.json["missing"], ["frete_modalidade_nao_suportada"])
        self.assertIsNone(response.json["frete"])
        self.assertEqual(get.call_count, 2)


if __name__ == "__main__":
    unittest.main()
