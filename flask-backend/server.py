from flask import Flask, request, jsonify, redirect, session
from flask_cors import CORS
import requests
import uuid
import hashlib
import base64
import os
from flask_session import Session
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
import datetime



DB_HOST = "localhost"
DB_PORT = "1737"
DB_NAME = 'novai'
DB_USER = 'postgres'
DB_PASSWORD = 'S3t3mbro41'
def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        cursor_factory=RealDictCursor  # Retorna resultados como dicionários
    )
    return conn

    
app = Flask(__name__)
app.secret_key = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Impede que scripts acessem os cookies
app.config['SESSION_COOKIE_SECURE'] = True  # Se True, só permite cookies via HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = "None"

Session(app)  # Inicializa a sessão
CORS(app, supports_credentials=True)

# 🔑 Suas credenciais do Mercado Livre
CLIENT_ID = "3414621845496970"
CLIENT_SECRET = "Zn1vIKKBbucQvaR9BRxcg6ufGn39iW4h"
# 🌎 URL de redirecionamento configurada no painel do Mercado Livre
REDIRECT_URI = "https://7117-2804-7f0-7980-164f-e0db-9d26-59e2-43d6.ngrok-free.app/callback"

@app.route('/add-usuario', methods=['POST'])
def add_usuario():
    print('entrou no add-usuario')
    email = request.form.get('email')
    senha = request.form.get('senha')

    if not email or not senha:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    try:
        # Gerando o hash da senha com bcrypt
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(senha.encode('utf-8'), salt).decode('utf-8')

        conn = get_db_connection()
        cur = conn.cursor()

        cur.execute("SELECT * FROM usuarios WHERE email = %s;", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Usuário já cadastrado"}), 400

        cur.execute(
            "INSERT INTO usuarios (email, senha) VALUES (%s, %s) RETURNING id;",
            (email, hashed_password)
        )
        novo_id = cur.fetchone()['id']
        print(f"Novo ID: {novo_id}")
        conn.commit()

        cur.close()
        conn.close()

        session['user_id'] = novo_id  # Salva o ID do usuário na sessão
        print(f"ID do usuário na sessão: {session.get('user_id')}")
        redire=f'https://7117-2804-7f0-7980-164f-e0db-9d26-59e2-43d6.ngrok-free.app/login'
        response = redirect(redire)
        return response

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
@app.route('/verificar_id', methods=['POST'])
def verificar_id():
    print("Entrou no verificar_id")
    # Obtém o user_id dos parâmetros da query string
    data=request.get_json()
    user_id = data.get('user_id')
    print(user_id)
    if not user_id:
        return jsonify({"error": "Parâmetro user_id ausente"}), 400
    try:
        # Conecta ao banco de dados
        conn = get_db_connection()
        cur = conn.cursor()

        # Consulta o e-mail do usuário na tabela 'usuarios'
        cur.execute("SELECT email FROM usuarios WHERE id = %s;", (user_id,))
        user_data = cur.fetchone()
        if not user_data:
            print('usuario não encontrado')
            return jsonify({"error": "Usuário não encontrado"}), 404

        user_email = user_data['email']

        # Consulta o token de acesso na tabela 'contas_mercado_livre'
        # (Note que usamos a coluna 'acess_token' conforme a sua criação)
        cur.execute(
            "SELECT acess_token FROM contas_mercado_livre WHERE usuario_id = %s ORDER BY id DESC LIMIT 1;",
            (user_id,)
        )
        token_row = cur.fetchone()
        if not token_row:
            print('Conta do Mercado Livre não encontrada para este usuário')
            return jsonify({"error": "Conta do Mercado Livre não encontrada para este usuário"}), 404

        acess_token = token_row['acess_token']

        # Faz uma requisição para a API do Mercado Livre para pegar os dados do usuário
        headers = {
            "Authorization": f"Bearer {acess_token}"
        }
        ml_response = requests.get("https://api.mercadolibre.com/users/me", headers=headers)
        if ml_response.status_code != 200:
            print('Erro ao acessar a API do Mercado Livre')
            return jsonify({
                "error": "Erro ao acessar a API do Mercado Livre",
                "status_code": ml_response.status_code,
                "details": ml_response.text
            }), ml_response.status_code

        ml_user_data = ml_response.json()
        # Por exemplo, pegamos o 'nickname' como o nome da conta
        account_name = ml_user_data.get("nickname", "N/A")

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        # Certifique-se de fechar o cursor e a conexão
        cur.close()
        conn.close()
        print("Saiu do verificar_id, user_id: ", user_id, 'user_email: ', user_email, 'account_name: ', account_name)
        return jsonify({"valid": True, "user_id": user_id, "user_email": user_email, "account_name": account_name}), 200




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

    if not email or not password:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    try:
        conn = get_db_connection()
        cur = conn.cursor()

        # Busca o usuário pelo e-mail no banco
        cur.execute("SELECT * FROM usuarios WHERE email = %s;", (email,))
        user = cur.fetchone()

        cur.close()
        conn.close()

        if user:
            hashed_password = user['senha']
            # Verifica se a senha fornecida bate com o hash armazenado
            if bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8')):
                session['user_id'] = user['id'] # Salva o ID do usuário na sessão
                return jsonify({
                    "message": "Login bem-sucedido",
                    "status": "success",
                    "user": {"id": user['id'], "email": user['email']},
                    "token": "abc123xyz"  # Aqui você pode implementar a geração de um token real
                }), 200
            else:
                return jsonify({"message": "Credenciais inválidas", "status": "error"}), 401
        else:
            return jsonify({"message": "Usuário não encontrado", "status": "error"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# 🔥 2️⃣ Rota para login com Mercado Livre (Autenticação com PKCE)
@app.route('/login', methods=['GET'])
def login():

    print("Entrou no login")
    user_id = session.get('user_id')
    if not user_id:
        return "Usuário não autenticado", 401

    state = str(uuid.uuid4())
    code_verifier = generate_code_verifier()
    code_challenge = generate_code_challenge(code_verifier)

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO verifier (user_id, state, code_verifier) VALUES (%s, %s, %s)",
        (user_id, state, code_verifier)
    )
    conn.commit()
    cur.close()
    conn.close()
    session['code_verifier'] = code_verifier
    auth_url = f"https://auth.mercadolivre.com.br/authorization?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&state={state}&code_challenge={code_challenge}&code_challenge_method=S256"
    return redirect(auth_url)

# 🔥 3️⃣ Callback para capturar código de autorização e obter Access Token
@app.route('/callback', methods=['GET'])
def callback():
    state = request.args.get('state')
    code = request.args.get('code')

    if not state or not code:
        return "Parâmetros ausentes", 400
    print("parametros recbidos: ", state, code)
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT user_id, code_verifier FROM verifier WHERE state = %s", (state,))
    result = cur.fetchone()
    cur.close()
    conn.close()

    if not result:
        print("Sessão OAuth não encontrada")
        return "Sessão OAuth não encontrada", 400
    print("result: ", result)
    usuario_id = result['user_id']
    code_verifier = result['code_verifier']

    # Troca do código de autorização pelo token de acesso
    token_url = "https://api.mercadolibre.com/oauth/token"
    payload = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier
    }

    response = requests.post(token_url, data=payload)
    token_data = response.json()

    if "access_token" not in token_data:
        print('Erro ao obter o Access Token')
        return "Erro ao obter o Access Token", 400

    # Armazenando informações

    # Calcula a data/hora de expiração do token
    expires_in = token_data["expires_in"]  # em segundos
    expiracao_token = datetime.datetime.now() + datetime.timedelta(seconds=expires_in)

    # Verifica se o usuario_id foi recuperado e esta autenticado
    print("usuario_id: ", usuario_id)
    print('token:',token_data["access_token"])
    print('expiracao:',expiracao_token)
    print('refresh_token:',token_data.get("refresh_token", ""))
    if not usuario_id:
        print("usuario nao autenticado internamente")
        return jsonify({"error": "Usuário não autenticado internamente"}), 401

    try:
    # Conecta ao banco e obtém o cursor
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Insere os dados na tabela contas_mercado_livre e retorna o id inserido
        cur.execute(
            """
            INSERT INTO contas_mercado_livre 
            (usuario_id, acess_token, refresh_token, expiracao_token)
            VALUES (%s, %s, %s, %s) RETURNING id;
            """,
            (
                usuario_id,
                token_data["access_token"],
                token_data.get("refresh_token", ""),
                expiracao_token
            )
        )
        
        # Obtém o id da conta inserida
        result = cur.fetchone()
        if result is None:
            print("Falha ao inserir a conta do Mercado Livre")
            conn.rollback()
            return jsonify({"error": "Falha ao inserir a conta do Mercado Livre"}), 500
        conta_id = result['id']
        
        # Deleta o registro da tabela verifier relacionado ao usuário
        cur.execute("DELETE FROM verifier WHERE user_id = %s", (usuario_id,))
        if cur.rowcount == 0:
            print(f"Nenhum registro encontrado para o usuário {usuario_id} na tabela verifier")
        
        conn.commit()
    except Exception as e:
        conn.rollback()
        print("Ocorreu um erro:", e)
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        conn.close()
    # Após salvar os dados, redireciona para o dashboard ou outra página principal
    print("Redirecionando para o dashboard", 'usuario_id: ', usuario_id)
    return redirect(f"http://localhost:3000/dashboard?user_id={usuario_id}")

# 🚀 Rodar o servidor
if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)
