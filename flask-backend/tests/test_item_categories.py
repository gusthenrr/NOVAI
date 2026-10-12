import sys
from pathlib import Path
import unittest
from unittest.mock import MagicMock, patch

from flask import Flask
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import item_categories as module


class ItemCategoriesTest(unittest.TestCase):
    def setUp(self):
        module._cache.clear()
        app = Flask(__name__)
        app.register_blueprint(module.item_categories)
        self.client = app.test_client()
        self.url = "/api/ext/categories/MLB9600"
        self.data = {"id": "MLB9600", "name": "Cabos de Energia",
                     "path_from_root": [{"id": "MLB1648", "name": "Informática"},
                                        {"id": "MLB9600", "name": "Cabos de Energia"}],
                     "token": "never_return", "children_categories": []}

    def response(self, status=200, data=None):
        response = MagicMock(status_code=status, content=b"{}")
        response.json.return_value = self.data if data is None else data
        return response

    @patch("item_categories.requests.get")
    def test_normalizes_official_tree_without_credentials_and_caches_success(self, get):
        get.return_value = self.response()
        expected = {"id": "MLB9600", "name": "Cabos de Energia", "path": ["Informática", "Cabos de Energia"],
                    "rootId": "MLB1648", "rootName": "Informática"}
        for _ in range(2):
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, expected)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        get.assert_called_once_with("https://api.mercadolibre.com/categories/MLB9600",
                                    headers={"Accept": "application/json"}, timeout=(3, 7), allow_redirects=False)

    @patch("item_categories.requests.get")
    def test_invalid_ids_never_contact_ml(self, get):
        for value in ["MLBU3764123782", "MLA9600", "not-an-id", "MLB9600%3Ftoken%3Dx"]:
            self.assertNotEqual(self.client.get(f"/api/ext/categories/{value}").status_code, 200)
        get.assert_not_called()

    @patch("item_categories.requests.get")
    def test_invalid_or_mismatched_tree_is_not_cached(self, get):
        for data in [{}, {**self.data, "id": "MLB9999"}, {**self.data, "name": ""},
                     {**self.data, "path_from_root": []}, {**self.data, "path_from_root": [{"id": "MLB9999", "name": "wrong"}]}]:
            get.return_value = self.response(data=data)
            self.assertEqual(self.client.get(self.url).status_code, 502)
        self.assertFalse(module._cache)

    @patch("item_categories.requests.get")
    def test_failures_are_safe_and_not_cached(self, get):
        for status in [401, 403, 404, 429, 500, 302]:
            get.return_value = self.response(status)
            response = self.client.get(self.url)
            self.assertEqual(response.status_code, status if status in [401, 403, 404, 429] else 502)
            self.assertNotIn("never_return", response.get_data(as_text=True))
        for error, status in [(requests.Timeout(), 504), (requests.ConnectionError(), 502)]:
            get.side_effect = error
            self.assertEqual(self.client.get(self.url).status_code, status)
        self.assertFalse(module._cache)


if __name__ == "__main__":
    unittest.main()
