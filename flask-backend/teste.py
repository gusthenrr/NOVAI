
from flask import Flask, request, jsonify, redirect, session
from flask_cors import CORS
import requests
import uuid
import hashlib
import base64
import os
from flask_socketio import SocketIO,emit
from flask_session import Session
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
import datetime
from flask_jwt_extended import JWTManager, create_access_token,jwt_required,get_jwt_identity,decode_token
from openai import OpenAI
import datetime
from dotenv import load_dotenv
import json
from apscheduler.schedulers.background import BackgroundScheduler
from jwt import ExpiredSignatureError, InvalidTokenError
import time


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
socketio = SocketIO(app, cors_allowed_origins="*")
SECRET_KEY = os.urandom(24)
app.secret_key = os.urandom(24)
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True  # Impede que scripts acessem os cookies
app.config['SESSION_COOKIE_SECURE'] = True  # Se True, só permite cookies via HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = "None"
#Config do jwt
app.config["JWT_SECRET_KEY"] = "aquiumachavebemsegura"
jwt = JWTManager(app)

Session(app)  # Inicializa a sessão
CORS(app, supports_credentials=True)

url_global="https://a718-2804-7f0-7b40-a2d4-a8d4-ce87-3c4a-fc53.ngrok-free.app"
# 🔑 Suas credenciais do Mercado Livre
CLIENT_ID = "3414621845496970"
CLIENT_SECRET = "Zn1vIKKBbucQvaR9BRxcg6ufGn39iW4h"
# 🌎 URL de redirecionamento configurada no painel do Mercado Livre
REDIRECT_URI = f"{url_global}/callback"

load_dotenv(".env.local")
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)



###                                        ###
###TODAS AS MINHAS ROTAS INICIAIS EM ORDEM ###
###                                        ###


# CRIAR CONTA DE USUARIO DA NOVAI
@app.route('/add-usuario', methods=['POST'])
def add_usuario():
    print('Entrou no add-usuario')

    try:
        email = request.form.get('email')
        senha = request.form.get('senha')
        usuario = request.form.get('usuario')  # Novo campo

        if not email or not senha or not usuario:
            return jsonify({"error": "Usuário, email e senha são obrigatórios"}), 400

        # Gerando o hash da senha com bcrypt
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(senha.encode('utf-8'), salt).decode('utf-8')

        conn = get_db_connection()
        cur = conn.cursor()

        # Verificar se o email já está cadastrado
        cur.execute("SELECT * FROM usuarios WHERE email = %s;", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            return jsonify({"error": "Usuário já cadastrado"}), 400

        # Inserir novo usuário no banco de dados
        cur.execute(
            "INSERT INTO usuarios (usuario, email, senha,modo_automatico) VALUES (%s, %s, %s,%s) RETURNING id;",
            (usuario, email, hashed_password,False)
        )
        novo_id = cur.fetchone()['id']
        print(f"Novo ID: {novo_id}")
        session['novo_id']=novo_id
        conn.commit()
        cur.close()
        conn.close()
        
        redirect_uri=f'{url_global}/login'
        return redirect(redirect_uri)      
         # Redirecionar para a página de login

    except Exception as e:
        return jsonify({"error": str(e)}), 500




# PESSOA IRA LOGAR CONTA DO MERCADO-LIVRE
@app.route('/login', methods=['GET'])
def login():
    print("Entrou no login")
    user_id=session['novo_id']
    print("encontrou o user_id no /login: ", user_id)
    
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



#CALLBACK ONDE AUTENTICAMOS COM SEGURANÇA UM ROTA ENTRE NOVAI E A CONTA DO MERCADO-LIVRE(USUARIO)
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
    print("token_data:",token_data)
    headers = {
    "Authorization": f"Bearer {token_data['access_token']}"
}
    print(requests.get('https://api.mercadolibre.com/users/me', headers=headers))

    if "access_token" not in token_data:
        print('Erro ao obter o Access Token')
        return "Erro ao obter o Access Token", 400
    else:
        print('users/me ',end=' ')
        resp_user_me =requests.get('https://api.mercadolibre.com/users/me', headers=headers)
        user_me = resp_user_me.json()
        print(user_me)

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
        token_jwt=gerar_token(usuario_id)
    # Após salvar os dados, redireciona para o dashboard ou outra página principal
    print("Redirecionando para o dashboard", 'usuario_id: ', token_jwt)
    return redirect("http://localhost:3000/")


# LOGIN, SISTEMA DE VERIFICAÇÃO DE CONTA
@app.route('/user-login', methods=['POST'])
def user_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    agora=datetime.datetime.now()
    print("agora:",agora)
    if not email or not password:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400
    try:
        print("entrou no try")
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        print("entrou no banco de dados")
        # Busca o usuário pelo e-mail no banco
        cur.execute("SELECT * FROM usuarios WHERE email = %s;", (email,))
        user = cur.fetchone()
        print(user['id'])
        cur.execute("SELECT expiracao_token FROM contas_mercado_livre WHERE usuario_id=%s",(user['id'],))
        expiracao=cur.fetchone()
        print("Valor de expiracao:", expiracao)
        if user:
            if agora>expiracao["expiracao_token"]:
                print("verificou que o token expirou")
                cur.execute("SELECT refresh_token FROM contas_mercado_livre WHERE usuario_id=%s",(user['id'],))
                refresh=cur.fetchone()
                dados=renovar_access_token(refresh["refresh_token"])
                print("retornando os dados:", dados)
                access_token=dados["access_token"]
                print(access_token)
                refresh=dados["novo_refresh_token"]
                print(refresh)
                expiracao=dados["nova_expiracao"]
                print(expiracao)
                cur.execute("UPDATE contas_mercado_livre SET acess_token=%s,refresh_token=%s,expiracao_token=%s WHERE usuario_id=%s",(access_token,refresh,expiracao,user["id"]))
                conn.commit()
            hashed_password = user['senha']
            # Verifica se a senha fornecida bate com o hash armazenado
            if bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8')):
                session['user_id'] = user['id'] # Salva o ID do usuário na sessão
                jwt_token=gerar_token(user['id'])
                getApiMercadoLivre(jwt_token)
                print("retornando front end tudo ok")
                return jsonify({
                    "message": "Login bem-sucedido",
                    "status": "success",
                    "user": {"id": user['id'], "email": user['email']},
                    "token": jwt_token  # Aqui você pode implementar a geração de um token real
                }), 200
            else:
                print("retornando erro 1")
                return jsonify({"message": "Credenciais inválidas", "status": "error"}), 401
        else:
            print('retornando erro 2')
            return jsonify({"message": "Usuário não encontrado", "status": "error"}), 404
        

    except Exception as e:
        print("Erro capturado:", str(e))
        print("retornando erro 3")
        return jsonify({"error": str(e)}),500
    finally:
        # Certifique-se de fechar o cursor e a conexão
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()



#VERIFICAÇÃO DE USUARIO, VERIFICA SE O TOKEN GERADO ESTA ASSINADO OU NAO EXPIRADO
@app.route('/verificar_id', methods=['POST'])
def verificar_id():
    print("Entrou no verificar_id")
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return jsonify({"error": "Cabeçalho Authorization ausente"}), 401
    # Obtém o user_id dos parâmetros da query string
    token = auth_header.split(" ")[1] if " " in auth_header else auth_header
    print("Token:", token)
    try:
        decoded_token=decode_token(token)
        print(decoded_token)
        user_id=decoded_token.get("sub")
        print(user_id)
        exp_timestamp = decoded_token.get("exp")
        now = int(time.time())
        if exp_timestamp and exp_timestamp < now:
            return jsonify({"error": "Token expirado"}), 333
        if not user_id:
            return jsonify({"error": "Parâmetro user_id ausente"}), 400
        # Conecta ao banco de dados
        conn = get_db_connection()
        cur = conn.cursor()
        print("entrou o banco de dados")
        # Consulta o e-mail do usuário na tabela 'usuarios'
        cur.execute("SELECT email FROM usuarios WHERE id = %s;", (user_id,))
        user_data = cur.fetchone()
        if not user_data:
            print('usuario não encontrado')
            return jsonify({"error": "Usuário não encontrado"}), 404

        user_email = user_data['email']

        cur.execute("SELECT modo_automatico FROM usuarios WHERE id=%s",(user_id,))
        user_modo=cur.fetchone()
        modo_automatico=user_modo['modo_automatico']
        # Consulta o token de acesso na tabela 'contas_mercado_livre'
        # (Note que usamos a coluna 'acess' conforme a sua criação)
        cur.execute(
            "SELECT acess_token FROM contas_mercado_livre WHERE usuario_id = %s ORDER BY id DESC LIMIT 1;",
            (user_id,)
        )
        token_row = cur.fetchone()
        if not token_row:
            print('Conta do Mercado Livre não encontrada para este usuário')
            return jsonify({"error": "Conta do Mercado Livre não encontrada para este usuário"}), 404

        access_token = token_row['acess_token']
        print(access_token)
        # Faz uma requisição para a API do Mercado Livre para pegar os dados do usuário
        headers = {
            "Authorization": f"Bearer {access_token}"
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
        print(account_name)
        id_ml=ml_user_data["id"]
        print("id da conta do mercado livre",id_ml)     
        conn.commit()
        cur.execute("SELECT modo_automatico FROM usuarios WHERE id=%s",(user_id,))
        print("Saiu do verificar_id, user_id: ", user_id, 'user_email: ', user_email, 'account_name: ', account_name)
        return jsonify({"valid": True, "user_id": user_id, "user_email": user_email, "account_name": account_name, 'modo_automatico':modo_automatico,}), 200

    except Exception as e:
        print("Erro:", str(e))
        return jsonify({"error": str(e),"valid":False}), 500

    finally:
        # Certifique-se de fechar o cursor e a conexão
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()


###                         ###
###TODAS AS ROTAS SOCKET.ON ###
###                         ###

@socketio.on("getMensagens")
def getMensagens(payload):
    try:
        print("entrou no getMensagens")
        token=payload.get('token')
        tipo=payload.get("tipo")
        print("Token:", token)
        decoded_token=decode_token(token)
        user_id=decoded_token.get("sub")
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT cliente_nome, mensagem, data_envio, autor
              FROM mensagens_clientes
             WHERE usuario_id = %s AND tipo=%s
        """, (user_id,tipo))
        rows = cur.fetchall()
        cur.execute("SELECT DISTINCT ON (cliente_nome) cliente_nome,mensagem,data_envio,item_id,autor FROM mensagens_clientes WHERE usuario_id=%s AND tipo=%s ORDER BY cliente_nome,data_envio DESC", (user_id,tipo))
        rows_clientes=cur.fetchall()
        cur.execute("SELECT acess_token FROM contas_mercado_livre WHERE usuario_id=%s",(user_id,))
        access_token=cur.fetchone()
        access_token_row=access_token['acess_token'] if access_token else 'Sem token'
        print("acess token:",access_token_row)
        

        # Converte cada row (RealDictRow) em dict puro e serializa o datetime
        mensagens = []
        for row in rows:
            mensagens.append({
                "cliente_nome": row["cliente_nome"],
                "mensagem":     row["mensagem"],
                "data_envio":   row["data_envio"].isoformat(),    # ou .strftime("%Y-%m-%d %H:%M:%S")
                "autor":         row["autor"],
            })
        clientes=[]
                # Supondo que 'cur' é seu cursor do banco de dados
        # Você pode adicionar um WHERE se souber quais item_ids são relevantes
        # ex: WHERE item_id IN (lista_de_item_ids_dos_seus_clientes)
        cur.execute("SELECT item_id, imagem FROM itens")
        todos_os_itens_com_imagem = cur.fetchall()
        mapa_imagens = {}
        if todos_os_itens_com_imagem: # Verifica se a lista não está vazia
            for item_db_row in todos_os_itens_com_imagem:
                # Acessando os valores usando as chaves do dicionário (RealDictRow)
                id_do_item = item_db_row['item_id']
                lista_urls_imagem = item_db_row['imagem'] # Isso é uma lista de URLs

                # Verifica se a lista de URLs não está vazia e pega a primeira URL
                if lista_urls_imagem and len(lista_urls_imagem) > 0:
                    url_imagem_principal = lista_urls_imagem[0] # Pega a primeira URL da lista
                    mapa_imagens[id_do_item] = url_imagem_principal
                else:
                    # Se a lista de imagens estiver vazia para este item_id,
                    # você pode armazenar None ou um placeholder.
                    mapa_imagens[id_do_item] = None
                    print(f"Aviso: item_id '{id_do_item}' não possui URLs de imagem na lista.")
        else:
            print("A lista 'todos_os_itens_com_imagem' está vazia ou não foi carregada.")
        for cliente_info in rows_clientes: # 'cliente_info' é cada dicionário/objeto da sua lista original
            item_id_do_cliente = cliente_info['item_id'] # Ou como você acessa o item_id do cliente
            imagem_correspondente = mapa_imagens.get(item_id_do_cliente)
            clientes.append({
                "cliente_nome": cliente_info['cliente_nome'],
                "mensagem": cliente_info['mensagem'],
                "data_envio": cliente_info["data_envio"].isoformat(),
                "autor": cliente_info['autor'],
                "item_id": item_id_do_cliente,
                "imagem": imagem_correspondente # Adiciona a imagem encontrada ou None
            })
        data={
            "mensagens":mensagens,
            "clientes":clientes,
        }
        cur.close()
        conn.close()
        emit("respostaGetMensagens",data, broadcast=True)
        
    except Exception as e:
        print("Erro ao pegar os dados:", str(e))



@socketio.on('mudarModo')
def mudar_modo_automatico(modo):
    try:
        conn=get_db_connection()
        cur=conn.cursor()
        cur.execute("UPDATE usuarios SET modo_automatico=%s",(modo,))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print("Erro:", str(e))

@socketio.on('getItens')
def getItens(data):
    try:
        token=data.get('token')
        decoded_token=decode_token(token)
        user_id=decoded_token.get('sub')
        conn=get_db_connection()
        cur=conn.cursor()
        cur.execute('SELECT item_id,nome_item,quantidade,preco,descricao,imagem,preco_original,preco_base FROM itens WHERE usuario_id=%s',(user_id,))
        row_itens=cur.fetchall()

        itens_detalhes=[]
        for row in row_itens:
            itens_detalhes.append({
                'item_id':row['item_id'],
                'nome_item':row['nome_item'],
                "quantidade":row['quantidade'],
                'preco':row['preco'],
                'descricao':row['descricao'],
                'imagem':row['imagem'],
                'preco_original':row['preco_original'],
                'preco_base':row['preco_base'],
            })
        print(itens_detalhes)
        for i,row in enumerate(row_itens[0]):
            print(f'{i}: printou= {type(row)}')
        emit('RespostaGetItens', { 'itens': itens_detalhes })
    except Exception as e:
        print("Erro em getItens:", str(e))
    finally:
        try:
            cur.close()
            conn.close()
        except:
            pass
@socketio.on("mensagem_cliente")
def mensagem_cliente(data):
    try:
        token = data.get('token')
        print("Token:", token)
        decoded_token=decode_token(token)
        print(decoded_token)
        user_id=decoded_token.get("sub")
        cliente_nome = data["cliente_nome"]
        mensagem     = data["mensagem"]
        autor        = data["autor"]
        data_envio   = datetime.datetime.now()
        tipo=data['tipo']
        # 1) salva no banco
        conn = get_db_connection()
        cur  = conn.cursor()
        cur.execute("SELECT modo_automatico FROM usuarios WHERE id=%s",(user_id,))
        modo_row=cur.fetchone()
        modo=modo_row[0]
        cur.execute(
            "INSERT INTO mensagens_clientes (usuario_id, cliente_nome, mensagem, data_envio, autor,tipo) VALUES (%s, %s, %s, %s, %s,%s)",
            (user_id, cliente_nome, mensagem, data_envio, autor,tipo)
        )
        conn.commit()
        cur.close()
        conn.close()

        # 2) Se veio do cliente, chama a OpenAI e emite a resposta
        if autor == "cliente" and modo:
            if modo:
                resposta = chat(mensagem)  # devolve só a string
                autor_resposta='novai'
            print(resposta)
            # opcional: também salvar no banco a resposta do assistente
            conn = get_db_connection()
            cur  = conn.cursor()
            cur.execute(
                "INSERT INTO mensagens_clientes (usuario_id, cliente_nome, mensagem, data_envio, autor,tipo) VALUES (%s, %s, %s, %s, %s,%s)",
                (user_id, cliente_nome, resposta, datetime.datetime.now(), autor_resposta,tipo)
            )
            conn.commit()
            cur.close()
            conn.close()
            payload={
                "user_id":user_id,
                "token":token,
            }
            # agora emite pro front-end
        # 3) Por fim, atualiza a lista completa de mensagens (se for esse seu fluxo)
        getMensagens(payload)

    except Exception as e:
        print("erro ao armazenar mensagem:", str(e))


###                         ###
### FUNÇÕES A SEREM CHAMADAS###
###                         ###

def buscar_item(item_id,access_token):
    url=f"https://api.mercadolibre.com/items/{item_id}"

    headers={
        "Authorization":f"Bearer {access_token}"
    }
    response=requests.get(url,headers=headers)
    return response.json()

def listar_conversas_pos_venda(user_id,id,access_token):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT cliente_id, mensagem FROM mensagens_clientes WHERE usuario_id=%s AND tipo=%s",(user_id,'posvenda',))
    comparar=cur.fetchall()
    clientes_existentes=[]
    mensagens_existentes=[]
    if comparar:
        clientes_existentes=[linha['cliente_id'] for linha in comparar]
        mensagens_existentes=[linha['mensagem'] for linha in comparar]
    print('Entrou em listar_conversas_pos_venda')
    url = f"https://api.mercadolibre.com/orders/search?seller={id}&sort=date_created:desc&offset=0&limit=50&order.status=paid"
    headers = {"Authorization": f"Bearer {access_token}"}

    response = requests.get(url, headers=headers)
    if response.status_code != 200:
        print("Erro ao buscar pedidos:", response.text)
        return []
    orders = response.json()
    results = orders.get("results", [])
    if not results:
        print("Nenhuma ordem encontrada.")
        return []
    # Esta forma só funciona se o seu cursor estiver configurado para retornar dicionários
# Ex: conn.row_factory = sqlite3.Row (para sqlite3) ou usando um DictCursor (para psycopg2)

    cur.execute("SELECT item_id FROM itens")
    itens_existentes = set()
    print("Processando itens (modo dicionário) para adicionar ao conjunto...")

    for linha_dict in cur:  # O cursor retorna uma linha (dicionário) por vez
    # 'linha_dict' será algo como {'item_id': valor_do_item_id}
        item_id_da_linha = linha_dict['item_id']
        itens_existentes.add(item_id_da_linha)

    print(f"Itens existentes encontrados: {itens_existentes}")
    print("itens existentes:",itens_existentes)
    for i, pedido in enumerate(results):
        order_id = pedido.get('id')
        pack_id = pedido.get('pack_id')
        url = f"https://api.mercadolibre.com/orders/{order_id}"
        
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception(f"Erro ao buscar ordem: {response.status_code} - {response.text}")

        item_detalhes = response.json()
        
        for itens in item_detalhes['order_items']:
            print('entrou no item_detalhes')
            item_id = itens['item']['id']
            quantidade = itens.get('quantity', 0)  # Corrigido
            # Pega detalhes do item
            if item_id not in itens_existentes:
                url_item = f"https://api.mercadolibre.com/items/{item_id}"
                response_item = requests.get(url_item, headers=headers)
                if response_item.status_code != 200:
                    print(f"Erro ao buscar item {item_id}: {response_item.status_code}")
                    continue
                resposta_itens = response_item.json()
                itens_existentes.add(item_id)
                nome_item = resposta_itens.get('title')
                # Imagem com proteção
                pictures = resposta_itens.get('pictures', [])
                imagem = []
                if pictures and isinstance(pictures, list) and 'url' in pictures[0]:
                    imagem.append(pictures[0]['url'])
                else:
                    imagem.append('nao tem')

                preco = resposta_itens.get('price', 0.0)
                preco_original = resposta_itens.get('original_price', 0.0)
                preco_base = resposta_itens.get('base_price', 0.0)

                # Busca descrição protegida
                url_desc = f"https://api.mercadolibre.com/items/{item_id}/description"
                response_desc = requests.get(url_desc, headers=headers)
                if response_desc.status_code == 200:
                    descrisoes_data = response_desc.json()
                    descricao = descrisoes_data.get('plain_text') or descrisoes_data.get('text') or 'Sem descrição'
                else:
                    descricao = 'Sem descrição'

                try:
                    cur.execute(
                        'INSERT INTO itens (usuario_id, item_id,nome_item, quantidade, preco, descricao, imagem, preco_original, preco_base) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                        (user_id, item_id,nome_item ,quantidade, preco, descricao, imagem, preco_original, preco_base,)
                    )
                    conn.commit()
                except Exception as e:
                    print(f"Erro ao inserir item no banco: {e}")
        if pack_id:
            print(f"Pedido {i}: order_id = {order_id}, pack_id = {pack_id}")

            url = f"https://api.mercadolibre.com/messages/packs/{pack_id}/sellers/{id}?mark_as_read=false&tag=post_sale"
            response = requests.get(url, headers=headers)
            msg=response.json() 
            for m in msg.get('messages'):
                if m:
                    id_from=m.get('from')
                    if isinstance(id_from,dict) and id_from['user_id']!=id:
                        cliente_id=id_from['user_id']
                        autor = 'cliente'
                        cliente_nome = buscar_nome(cliente_id, access_token)
                    else:
                        autor='vendedor'
                        cliente_id = m['to']['user_id']
                        cliente_nome = buscar_nome(cliente_id, access_token)
                    if m.get('text') and m.get('message_date'):
                        print("autor",autor)
                        mensagem=m.get('text')
                        message_date=m.get('message_date')
                        data_envio=message_date['created']
                        read_existe = message_date.get('read', False)
                        read = True if read_existe else False
                        if not comparar or ((cliente_id not in clientes_existentes) and  (mensagem not in mensagens_existentes)):
                            cur.execute('INSERT INTO mensagens_clientes (usuario_id,cliente_nome,mensagem,data_envio,autor,item_id,tipo,read) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',(user_id,cliente_nome['nickname'],mensagem,data_envio,autor,item_id,'posvenda',read,))
                    conn.commit()
    cur.close()
    conn.close()
    return True




def minha_funcao_periodica():
    print("Função executada automaticamente a cada 5 minutos!")
    # Aqui você pode colocar qualquer código (ex: sincronizar API, enviar emails, etc.)

# Cria e configura o scheduler
scheduler = BackgroundScheduler()
# Agenda a função para rodar a cada 5 minutos
scheduler.add_job(minha_funcao_periodica, 'interval', minutes=5)
scheduler.start()

@app.route('/')
def home():
    return 'Flask rodando! (Função periódica em background)'

# Garante que o scheduler será desligado ao fechar a aplicação
import atexit
atexit.register(lambda: scheduler.shutdown())


def listar_conversas_pre_venda(user_id,id,access_token):
    print("entrou no listar_conversas")
    url = f"https://api.mercadolibre.com/questions/search?seller_id={id}&api_version=4"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    conversas=response.json()
    conn=get_db_connection()
    cur=conn.cursor()
    cur.execute("SELECT cliente_id, mensagem FROM mensagens_clientes WHERE usuario_id=%s AND tipo=%s",(user_id,'prevenda',))
    clientes_existentes=[]
    mensagens_existentes=[]
    comparar=cur.fetchall()
    if comparar:
        clientes_existentes=[linha['cliente_id'] for linha in comparar]
        mensagens_existentes=[linha['mensagem'] for linha in comparar]
    for m in conversas['questions']:
        if m:
            form=m.get('from')
            if isinstance(form , dict) and form.get("id"):
                cliente_id=form.get('id')
                cliente_nome = buscar_nome(cliente_id, access_token)
            if m.get('item_id'):
                item=m.get('item_id')
            if m.get('text') and m.get('date_created'):
                mensagem = m['text']
                data_envio = m['date_created']

                if not comparar or (( cliente_id not in clientes_existentes) and  (mensagem not in mensagens_existentes)):
                    print("entrou no if da comp")
                    cur.execute(
                        "INSERT INTO mensagens_clientes (usuario_id, cliente_nome, mensagem, data_envio, autor,cliente_id,item_id,tipo) VALUES (%s, %s, %s, %s, %s,%s,%s,%s)",
                        (user_id, cliente_nome['nickname'], mensagem, data_envio, 'cliente',cliente_id,item,'prevenda')
                    )

            answer = m.get('answer')
            if isinstance(answer, dict) and answer.get('text') and answer.get('date_created'):
                resposta = answer['text']
                item=m.get('item_id')
                data_envio = answer['date_created']
                if not comparar or ((cliente_id not in clientes_existentes) and  (mensagem not in mensagens_existentes)):
                    cur.execute(
                        "INSERT INTO mensagens_clientes (usuario_id, cliente_nome, mensagem, data_envio, autor,cliente_id,item_id,tipo) VALUES (%s, %s, %s, %s, %s,%s,%s,%s)",
                        (user_id, cliente_nome['nickname'], resposta, data_envio, 'vendedor',cliente_id,item,"prevenda")
                    )

            conn.commit()
    conn.close()
    cur.close()
    return True

def buscar_nome(id_do_cliente,access_token):
    url=f"https://api.mercadolibre.com/users/{id_do_cliente}"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    return response.json()

# 🔹 Função para gerar o code_verifier (PKCE)
def generate_code_verifier():
    return base64.urlsafe_b64encode(os.urandom(64)).decode('utf-8').rstrip('=')

# 🔹 Função para gerar o code_challenge baseado no code_verifier
def generate_code_challenge(code_verifier):
    sha256_hash = hashlib.sha256(code_verifier.encode()).digest()
    return base64.urlsafe_b64encode(sha256_hash).decode('utf-8').rstrip('=')
def gerar_token(user_id):
    print('entrou no gerar token')
    token = create_access_token(identity=str(user_id), expires_delta=datetime.timedelta(hours=1))
    return token
def renovar_access_token(refresh_token):
    print("entrou no renovar_token")
    url = "https://api.mercadolibre.com/oauth/token"
    payload = {
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": refresh_token
    }
    response = requests.post(url, data=payload)
    token_data = response.json()
    if 'access_token' in token_data:
        print("encontrou o accesstoken:", token_data["access_token"])
        novo_access_token=token_data["access_token"]
        novo_refresh_token=token_data.get('refresh_token',refresh_token)
        print('novo refresh :',novo_refresh_token)
        expires_in=token_data['expires_in']
        nova_expiracao=datetime.datetime.now()+datetime.timedelta(seconds=expires_in)
    print("retornou")
    return {"access_token":novo_access_token,"novo_refresh_token":novo_refresh_token,"nova_expiracao":nova_expiracao}




# 🔥 3️⃣ Callback para capturar código de autorização e obter Access Token



def getApiMercadoLivre(data):
    print("entoru no getAPi do mercado livre")
    print("token:",data)
    decoded_token=decode_token(data)
    user_id=decoded_token.get('sub')
    conn=get_db_connection()
    cur=conn.cursor()
    cur.execute("SELECT acess_token FROM contas_mercado_livre WHERE usuario_id=%s",(user_id,))
    token_access=cur.fetchone()
    access_token=token_access['acess_token']
    headers = {
            "Authorization": f"Bearer {access_token}"
        }
    ml_response = requests.get("https://api.mercadolibre.com/users/me", headers=headers)
    response_ml=ml_response.json()
    id_ml=response_ml['id']
    listar_conversas_pos_venda(user_id,id_ml,access_token)
    listar_conversas_pre_venda(user_id,id_ml,access_token)
    return True


def chat(mensagem: str) -> str:
    print("entrou no chat")
    try:
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "Você é um vendedor do Mercado livre, apenas ajude com instruçoes, duvidas sobre o item especifico."},
                {"role": "user",   "content": mensagem},
            ],
            temperature=0.7,
            max_tokens=150,
        )
        return resp.choices[0].message.content
    except Exception as e:
        print("Erro na OpenAI:", e)
        return ""



# 🚀 Rodar o servidor
if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)