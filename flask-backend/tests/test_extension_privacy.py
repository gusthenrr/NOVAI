"""Public privacy disclosure must be readable without sessions or database access."""
import sys
from pathlib import Path
from unittest.mock import patch

from flask import Flask

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from extension_api import extension


def test_privacy_page_public_no_auth_no_database_and_no_active_content(monkeypatch):
    templates=Path(__file__).resolve().parents[1]/'templates'
    app=Flask(__name__,template_folder=str(templates))
    app.register_blueprint(extension)
    monkeypatch.setenv('NOVAI_LEGAL_NAME','Responsável de teste')
    monkeypatch.setenv('NOVAI_LEGAL_CONTACT','privacy@example.test')
    with patch('extension_api.db',side_effect=AssertionError('privacy must not query a database')):
        response=app.test_client().get('/api/extension/privacy')
    assert response.status_code==200
    assert response.mimetype=='text/html'
    text=response.get_data(as_text=True)
    assert 'Responsável de teste' in text and 'privacy@example.test' in text
    assert 'Novai - Ml Extension' in text and 'Uso Limitado' in text
    assert 'Mercado Livre' in text and 'Mercado Pago' in text and 'Railway' in text
    assert 'histórico geral' in text and 'GPS' in text and 'alíquota' in text
    assert '<script' not in text and '<form' not in text
    assert not response.headers.getlist('Set-Cookie')
    assert "default-src 'none'" in response.headers['Content-Security-Policy']
    assert response.headers['Cache-Control']=='no-store'
    assert response.headers['X-Content-Type-Options']=='nosniff'


def test_account_page_links_to_public_privacy_policy():
    templates=Path(__file__).resolve().parents[1]/'templates'
    app=Flask(__name__,template_folder=str(templates));app.register_blueprint(extension)
    response=app.test_client().get('/api/extension/account')
    assert response.status_code==200
    assert 'href="/api/extension/privacy"' in response.get_data(as_text=True)


def test_account_theme_is_bundled_and_uses_the_page_nonce():
    import re
    templates=Path(__file__).resolve().parents[1]/'templates'
    app=Flask(__name__,template_folder=str(templates))
    app.register_blueprint(extension)
    response=app.test_client().get('/api/extension/account')
    assert response.status_code==200
    html=response.get_data(as_text=True)
    assert 'novaiAccountTheme' in html and 'novai-privacy' in html
    nonce=re.search(r"script-src 'nonce-([^']+)'",response.headers['Content-Security-Policy'])[1]
    assert re.findall(r'<script nonce="([^"]+)"',html)==[nonce,nonce]
    assert "script-src 'unsafe-inline'" not in response.headers['Content-Security-Policy']
    assert 'https://' not in ''.join(re.findall(r'<script[^>]+src="([^"]+)"',html))
    assert all('id="'+field+'"' in html for field in ('form','email','password','terms','connected','connect','logout'))
