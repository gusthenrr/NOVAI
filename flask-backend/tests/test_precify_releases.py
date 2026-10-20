import json
import os
import sys
import unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from precify_releases import public_release

class Releases(unittest.TestCase):
    def payload(self, **changes):
        return json.dumps({'ios': {'testflight': dict(version='1.0.8', build='3',
            url='https://testflight.apple.com/join/Abcd1234', notes='Melhorias no frete.', **changes)}})

    def test_public_fields_only(self):
        raw = json.dumps({'ios': {'testflight': {'version':'1.0.8','build':'3',
            'url':'https://testflight.apple.com/join/Abcd1234','secret':'not-public'}}})
        self.assertEqual(set(public_release(raw,'ios','testflight')), {'version','build','url','notes','platform','channel'})

    def test_bad_or_unconfigured_release_is_not_advertised(self):
        for raw in ('', '{}', 'null', '[]', '{broken'):
            self.assertIsNone(public_release(raw, 'ios', 'testflight'))
        self.assertIsNone(public_release(self.payload(), 'android', 'testflight'))

    def test_urls_and_fields_are_validated(self):
        good = json.loads(self.payload())
        for key,value in [('url','https://testflight.apple.com.evil.test/join/Abcd1234'),
                          ('url','javascript:alert(1)'), ('build',True), ('version','latest'),
                          ('notes','x'*1001)]:
            data = json.loads(json.dumps(good)); data['ios']['testflight'][key]=value
            self.assertIsNone(public_release(json.dumps(data),'ios','testflight'))
        self.assertEqual(public_release(self.payload(),'ios','testflight')['build'],'3')

class ReleaseEndpoint(unittest.TestCase):
    def test_public_endpoint_needs_no_session_or_database(self):
        from flask import Flask
        from precify_api import precify
        from unittest.mock import patch
        app = Flask(__name__)
        app.register_blueprint(precify)
        raw = json.dumps({'ios': {'testflight': {'version':'1.0.8', 'build':'3',
            'url':'https://testflight.apple.com/join/Abcd1234'}}})
        with patch.dict(os.environ, {'PRECIFY_APP_RELEASES_JSON': raw}), patch('precify_api.db') as db:
            client = app.test_client()
            result = client.get('/api/precify/app-release?platform=ios&channel=testflight')
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json['release']['build'], '3')
            self.assertEqual(result.headers['Cache-Control'], 'no-store')
            self.assertEqual(client.get('/api/precify/app-release?platform=android&channel=testflight').status_code, 404)
            db.assert_not_called()
        with patch.dict(os.environ, {'PRECIFY_APP_RELEASES_JSON': '{}'}):
            self.assertEqual(client.get('/api/precify/app-release?platform=ios&channel=testflight').json, {'release': None})
