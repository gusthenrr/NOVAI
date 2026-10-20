import os
import json
import sys
import unittest
from threading import Barrier
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
    def test_both_types_are_parallel_share_owner_and_preserve_selected_response(self, get):
        barrier = Barrier(2)
        def reply(url, params=None, **kwargs):
            if url.endswith('/users/me'):
                return self.response({'id': 123456, 'site_id': 'MLB'})
            listing = params['listing_type_id']
            if url.endswith('/shipping_options/free'):
                barrier.wait(timeout=3)
                return self.response({'coverage': {'all_country': {'list_cost': 8 if listing == 'gold_special' else 9,
                    'currency_id': 'BRL', 'billable_weight': 300}}})
            return self.response({'listing_type_id': listing, 'currency_id': 'BRL',
                'sale_fee_amount': 15 if listing == 'gold_special' else 20})
        get.side_effect = reply
        with self.assertLogs('novai.pricing', level='INFO') as captured:
            response = self.post({**self.payload, 'tipoAnuncio': 'premium', 'incluirTiposAnuncio': True})
        self.assertEqual(response.status_code, 200)
        options = response.json['opcoesAnuncio']
        self.assertEqual(options['classico']['margemContribuicao'], 33)
        self.assertEqual(options['premium']['margemContribuicao'], 27)
        self.assertEqual({k: v for k, v in response.json.items() if k != 'opcoesAnuncio'}, options['premium'])
        self.assertEqual(get.call_count, 5)
        self.assertEqual(sum(c.args[0].endswith('/users/me') for c in get.call_args_list), 1)
        entries = [json.loads(line.split('[pricing] ', 1)[1]) for line in captured.output]
        self.assertEqual({e['diagnostic_id'] for e in entries}, {response.headers['X-Pricing-Diagnostic-Id']})
        self.assertEqual(sum(e['event'] == 'ml_response' for e in entries), 5)

    @patch("pricing_margin.requests.get")
    def test_failure_in_one_type_never_becomes_zero_or_contaminates_other(self, get):
        def reply(url, params=None, **kwargs):
            if url.endswith('/users/me'): return self.response({'id': 123456, 'site_id': 'MLB'})
            listing = params['listing_type_id']
            if url.endswith('/shipping_options/free'):
                if listing == 'gold_pro': return self.response({}, 403)
                return self.response({'coverage': {'all_country': {'list_cost': 8, 'currency_id': 'BRL'}}})
            return self.response({'listing_type_id': listing, 'currency_id': 'BRL', 'sale_fee_amount': 15})
        get.side_effect = reply
        response = self.post({**self.payload, 'incluirTiposAnuncio': True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['missing'], [])
        self.assertEqual(response.json['opcoesAnuncio']['classico']['frete'], 8)
        premium = response.json['opcoesAnuncio']['premium']
        self.assertIsNone(premium['frete'])
        self.assertIsNone(premium['margemContribuicao'])
        self.assertEqual(premium['missing'], ['frete_403'])

    @patch("pricing_margin.requests.get")
    def test_both_flag_requires_boolean_and_expired_token_is_not_hidden(self, get):
        for value in ['true', 1, None]:
            self.assertEqual(self.post({**self.payload, 'incluirTiposAnuncio': value}).status_code, 400)
        get.assert_not_called()
        def reply(url, **kwargs):
            return self.response({'id': 123456, 'site_id': 'MLB'}) if url.endswith('/users/me') else self.response({}, 401)
        get.side_effect = reply
        response = self.post({**self.payload, 'incluirTiposAnuncio': True})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json, {'error': 'ml_token_expired'})

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
    def test_me2_account_notice_is_specific_and_keeps_quote_partial(self, get):
        for message, expected in [
            ("user 123456 does Not have me2 enabled", "frete_conta_sem_me2"),
            ("user 999999 does Not have me2 enabled", "frete_400"),
            ("invalid dimensions", "frete_400"),
        ]:
            replies = self.replies()
            replies[1] = self.response({"message": message, "error": "bad_request"}, 400)
            get.side_effect = replies
            result = self.post().json
            self.assertEqual(result["missing"], [expected])
            self.assertIsNone(result["frete"])
            self.assertIsNone(result["margemContribuicao"])
            self.assertEqual(result["tarifas"], 15)
            self.assertNotIn(message, json.dumps(result))

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

    @patch("pricing_margin.requests.get")
    def test_diagnostics_capture_400_cause_and_parameters_without_credentials(self, get):
        replies = self.replies()
        replies[0].json.return_value.update(email="private@example.test", address="private-address")
        replies[1] = self.response({"error": "invalid_parameters", "message": "Invalid dimensions; echoed test-credential",
                                   "cause": [{"code": "invalid_dimensions", "field": "dimensions"}],
                                   "access_token": "nested-secret"}, 400)
        get.side_effect = replies
        with self.assertLogs("novai.pricing", level="INFO") as captured:
            response = self.post({**self.payload, "nome": "Produto", "access_token": "body-secret",
                                  "headers": {"Cookie": "cookie-secret", "client_secret": "client-secret"}})
        entries = [json.loads(line.split("[pricing] ", 1)[1]) for line in captured.output]
        rendered = "\n".join(captured.output)
        for secret in ["test-credential", "body-secret", "nested-secret", "cookie-secret", "client-secret",
                       "private@example.test", "private-address"]:
            self.assertNotIn(secret, rendered)
        quotes = [entry for entry in entries if entry["event"] == "ml_request" and entry["path"].endswith("/shipping_options/free")]
        self.assertEqual(quotes[0]["params"]["dimensions"], "5x15x20,300")
        self.assertTrue(quotes[0]["authorization_present"])
        failure = next(entry for entry in entries if entry["event"] == "ml_response" and entry["http_status"] == 400)
        self.assertEqual(failure["body"]["cause"][0]["code"], "invalid_dimensions")
        self.assertIn("[REDACTED]", failure["body"]["message"])
        final = next(entry for entry in entries if entry["event"] == "calculator_response")
        self.assertEqual(final["body"], response.json)
        self.assertEqual(response.json["missing"], ["frete_400"])
        self.assertEqual({entry["diagnostic_id"] for entry in entries}, {response.headers["X-Pricing-Diagnostic-Id"]})

    @patch("pricing_margin.requests.get")
    def test_transport_diagnostic_and_non_json_response_are_safe(self, get):
        get.side_effect = [self.replies()[0], requests.Timeout("https://example.test?token=test-credential"), self.replies()[2]]
        with self.assertLogs("novai.pricing", level="INFO") as captured:
            response = self.post()
        self.assertEqual(response.json["missing"], ["frete_timeout"])
        self.assertIn('"code": "timeout"', "\n".join(captured.output))
        self.assertNotIn("test-credential", "\n".join(captured.output))
        replies = self.replies()
        replies[1].json.side_effect = ValueError("HTML containing test-credential")
        get.side_effect = replies
        with self.assertLogs("novai.pricing", level="INFO") as captured:
            response = self.post()
        self.assertEqual(response.json["missing"], ["frete_invalid_response"])
        self.assertIn('"body_format": "non_json"', "\n".join(captured.output))
        self.assertNotIn("test-credential", "\n".join(captured.output))

    @patch("pricing_margin.requests.get")
    def test_unrelated_ml_reads_do_not_enable_calculator_logging(self, get):
        from pricing_diagnostics import pricing_log
        with self.client.application.app_context():
            get.side_effect = self.replies()
            self.post()
            with self.assertNoLogs("novai.pricing", level="INFO"):
                pricing_log("unrelated", {"message": "must not log"})


if __name__ == "__main__":
    unittest.main()
