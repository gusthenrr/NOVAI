from flask import Flask, request, jsonify, redirect, session
from flask_cors import CORS
import requests
import uuid
import hashlib
import base64
import os

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Chave de sessão para armazenar `code_verifier`
CORS(app)  # Permite requisições de origens diferentes (como do front-end)

# 🔑 Suas credenciais do Mercado Livre
CLIENT_ID = "3414621845496970"
CLIENT_SECRET = "Zn1vIKKBbucQvaR9BRxcg6ufGn39iW4h"

# 🌎 URL de redirecionamento configurada no painel do Mercado Livre
REDIRECT_URI = "https://6759-2804-7f0-7980-e83-466-8a28-bd1f-943.ngrok-free.app/callback"

# ✅ Simulação de usuários locais (login com e-mail/senha)
users = {
    "admin@example.com": "123456",
    "user@example.com": "password",
}

# 🔹 Função para gerar o `code_verifier` (PKCE)
def generate_code_verifier():
    return base64.urlsafe_b64encode(os.urandom(64)).decode('utf-8').rstrip('=')

# 🔹 Função para gerar o `code_challenge` baseado no `code_verifier`
def generate_code_challenge(code_verifier):
    sha256_hash = hashlib.sha256(code_verifier.encode()).digest()
    return base64.urlsafe_b64encode(sha256_hash).decode('utf-8').rstrip('=')

# 🔥 1️⃣ Login de usuário com e-mail/senha (sistema interno)
@app.route('/user-login', methods=['POST'])
def user_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if email in users and users[email] == password:
        return jsonify({
            "message": "Login bem-sucedido",
            "status": "success",
            "user": {"email": email},
            "token": "abc123xyz",
        }), 200
    else:
        return jsonify({
            "message": "Credenciais inválidas",
            "status": "error"
        }), 401  # Status de não autorizado

# 🔥 2️⃣ Rota para login com Mercado Livre (Autenticação com PKCE)
@app.route('/login', methods=['GET'])
def login():
    state = str(uuid.uuid4())  # Gera um UUID único para o state
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)

    session['code_verifier'] = code_verifier  # Salva o code_verifier na sessão

    auth_url = f"https://auth.mercadolivre.com.br/authorization?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&state={state}&code_challenge={code_challenge}&code_challenge_method=S256"

    return redirect(auth_url)  # Redireciona para o Mercado Livre

# 🔥 3️⃣ Callback para capturar código de autorização e obter Access Token
@app.route('/me', methods=['GET'])
def get_user_info():
    access_token = "APP_USR-3414621845496970-013015-4109abbeb73cc2f90782940eb62ca8b0-2134428888"  # Substitua pelo token real

    url = "https://api.mercadolibre.com/users/me"
    headers = {
        "Authorization": f"Bearer {access_token}"
    }

    response = requests.get(url, headers=headers)
    
    if response.status_code == 200:
        return jsonify(response.json())  # Retorna os dados do usuário autenticado
    else:
        return jsonify({"error": "Erro ao buscar usuário", "details": response.json()}), response.status_code


@app.route('/callback', methods=['GET'])
def callback():
    auth_code = request.args.get('code')  # Obtém o código da URL
    state_received = request.args.get('state')  # O Mercado Livre pode enviar esse state de volta

    if not auth_code:
        return jsonify({"error": "Erro ao obter o código de autorização"}), 400

    # Recupera o code_verifier salvo na sessão
    code_verifier = session.get('code_verifier')

    if not code_verifier:
        return jsonify({"error": "Erro: code_verifier não encontrado na sessão"}), 400

    # Trocar código pelo Access Token
    token_url = "https://api.mercadolibre.com/oauth/token"
    payload = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": auth_code,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier
    }

    response = requests.post(token_url, data=payload)
    token_data = response.json()

    if "access_token" in token_data:
        return jsonify({
            "message": "Autenticação bem-sucedida",
            "access_token": token_data["access_token"],
            "refresh_token": token_data.get("refresh_token", "Não disponível"),
            "expires_in": token_data["expires_in"],
            "state_received": state_received  # Apenas para verificação no front-end
        })
    else:
        return jsonify({"error": "Erro ao obter o Access Token", "details": token_data}), 400

# 🚀 Rodar o servidor
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
