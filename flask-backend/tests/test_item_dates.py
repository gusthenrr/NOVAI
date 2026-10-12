import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from flask import Flask
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from item_dates import item_dates


class ItemDatesTest(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(item_dates)
        self.client = app.test_client()
        self.body = {"item_id": "MLB6203834422", "access_token": "test-token"}
        self.url = "/api/ext/items/created-at"

    def upstream(self, status=200, data=None):
        response = MagicMock(status_code=status)
        response.json.return_value = data or {}
        return response

    @patch("item_dates.requests.get")
    def test_real_observed_shape(self, get):
        iso = "2026-01-27T23:33:16.887Z"
        get.return_value = self.upstream(data={"date_created": iso, "last_updated": "2026-10-12T12:00:00Z"})
        response = self.client.post(self.url, json=self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"items": [{"id": "MLB6203834422", "date": "2026-01-27",
                                                "createdAt": iso, "source": "ml_description"}]})
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotIn("test-token", response.get_data(as_text=True))
        self.assertEqual(get.call_args.args, ("https://api.mercadolibre.com/items/MLB6203834422/description",))
        self.assertEqual(get.call_args.kwargs["headers"]["Authorization"], "Bearer test-token")
        self.assertFalse(get.call_args.kwargs["allow_redirects"])
        self.assertEqual(get.call_args.kwargs["timeout"], (3, 7))

    @patch("item_dates.requests.get")
    def test_header_token_and_deduplication(self, get):
        get.return_value = self.upstream(data={"date_created": "2024-08-18T01:39:52.171Z"})
        response = self.client.post(self.url, json={"ids": ["MLB3820285263", "MLB3820285263"]},
                                    headers={"Authorization": "Bearer test-token"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["items"][0]["date"], "2024-08-18")
        get.assert_called_once()

    @patch("item_dates.requests.get")
    def test_invalid_requests_never_contact_ml(self, get):
        cases = [(None, 400), ({"item_id": "MLB6203834422"}, 401),
                 ({**self.body, "item_id": "MLBU3764123782"}, 400),
                 ({**self.body, "item_id": "../../users/me"}, 400),
                 ({**self.body, "ids": []}, 400), ({**self.body, "ids": "MLB6203834422"}, 400),
                 ({**self.body, "access_token": "x\r\ny"}, 400)]
        for body, status in cases:
            with self.subTest(body=body):
                self.assertEqual(self.client.post(self.url, json=body).status_code, status)
        get.assert_not_called()

    @patch("item_dates.requests.get")
    def test_missing_description_or_date_returns_nulls(self, get):
        for status, data in [(404, {}), (200, {"last_updated": "2026-01-01T12:00:00Z"}),
                             (200, {"date_created": "invalid"}), (200, {"date_created": "2026-01-01"})]:
            with self.subTest(status=status, data=data):
                get.return_value = self.upstream(status, data)
                response = self.client.post(self.url, json=self.body)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json["items"][0], {"id": "MLB6203834422", "date": None,
                                                           "createdAt": None, "source": None})

    @patch("item_dates.requests.get")
    def test_upstream_failures(self, get):
        for upstream, expected in [(401, 401), (403, 403), (429, 429), (500, 502), (302, 502)]:
            with self.subTest(status=upstream):
                get.return_value = self.upstream(upstream)
                response = self.client.post(self.url, json=self.body)
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("items", response.json)
        for error, status in [(requests.Timeout(), 504), (requests.ConnectionError(), 502)]:
            get.side_effect = error
            self.assertEqual(self.client.post(self.url, json=self.body).status_code, status)

    @patch("item_dates.requests.get")
    def test_malformed_response(self, get):
        get.return_value = self.upstream()
        get.return_value.json.side_effect = ValueError()
        self.assertEqual(self.client.post(self.url, json=self.body).status_code, 502)


if __name__ == "__main__":
    unittest.main()
