from flask import Flask, request, jsonify, redirect, session, make_response
from flask_cors import CORS, cross_origin
import requests
import eventlet
eventlet.monkey_patch()
from psycogreen.eventlet import patch_psycopg
patch_psycopg()
import uuid
from uuid import UUID
import hashlib
import base64
import os
from langchain_core.runnables import RunnableLambda
import threading
from flask_socketio import SocketIO,emit, join_room
from flask_session import Session
import psycopg2
from psycopg2.extras import RealDictCursor
import bcrypt
from datetime import datetime,timedelta, date, time, timezone
from flask_jwt_extended import JWTManager, create_access_token,jwt_required,get_jwt_identity,decode_token
from openai import OpenAI
from dotenv import load_dotenv
import json
from apscheduler.schedulers.background import BackgroundScheduler
from jwt import ExpiredSignatureError, InvalidTokenError
import time
from langchain.callbacks.tracers import LangChainTracer 
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from pydantic import BaseModel, Field
from langchain.prompts.few_shot import FewShotPromptTemplate
from langchain.prompts.prompt import PromptTemplate
from typing import Optional, List, Any, Dict

DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = 'novai'
DB_USER = 'postgres'
DB_PASSWORD = 'S3t3mbro41'
def get_db_connection():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL não definido")
    return psycopg2.connect(url, cursor_factory=RealDictCursor)

app = Flask(__name__)
ALLOWED_ORIGIN = "https://app.nossopoint-backend-flask-server.com"
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGIN, async_mode='eventlet', ping_interval=20, ping_timeout=120)
load_dotenv(".env.local")
app.secret_key = os.getenv("FLASK_SECRET_KEY") 
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
CORS(app, supports_credentials=True, resources={r"/*": {"origins": [ALLOWED_ORIGIN]}})

url_global="https://nossopoint-backend-flask-server.com"
# 🔑 Suas credenciais do Mercado Livre
CLIENT_ID = "3414621845496970"
CLIENT_SECRET = "Zn1vIKKBbucQvaR9BRxcg6ufGn39iW4h"
# 🌎 URL de redirecionamento configurada no painel do Mercado Livre
REDIRECT_URI = f"{url_global}/callback"


api_key = os.getenv("OPENAI_API_KEY")
LangChainTracer(project_name="novo_projeto")
client = OpenAI(api_key=api_key)

COOKIE_NAME = "__Host-token"

def set_auth_cookie(resp, jwt_value: str):
    resp.set_cookie(
        key=COOKIE_NAME,
        value=jwt_value,
        httponly=True,
        secure=True,
        samesite="None",
        path="/",          # obrigatório para __Host-
        # sem Domain -> host-only
        max_age=60*60*24,
    )
    return resp

def clear_legacy_cookies(resp):
    # apaga qualquer 'token' residual (host-only)
    resp.set_cookie("token", "", max_age=0, path="/", secure=True, samesite="None")
    # apaga variações com Domain que podem ter ficado
    for d in [".nossopoint-backend-flask-server.com", "app.nossopoint-backend-flask-server.com"]:
        resp.set_cookie("token", "", max_age=0, path="/", domain=d, secure=True, samesite="None")
    return resp


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
    time.sleep(10) 
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
    response = requests.get('https://api.mercadolibre.com/users/me', headers=headers)
    response_data = response.json()
    id_ml = response_data.get('id')


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
    expiracao_token = datetime.now() + timedelta(seconds=expires_in)

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
            (usuario_id, acess_token, refresh_token, expiracao_token,id_ml)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                usuario_id,
                token_data["access_token"],
                token_data.get("refresh_token", ""),
                expiracao_token,
                id_ml,
            )
        )

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
    print('chegou aqui')
    response = make_response(redirect("https://app.nossopoint-backend-flask-server.com/loading"))
    response = clear_legacy_cookies(response)     # 👈 limpa lixo
    response = set_auth_cookie(response, token_jwt)  # 👈 define só o __Host-token
    return response


@app.route('/webhook/ml/messages', methods=['POST'])
def webhook_mercado_livre_messages():
    data = request.get_json(force=True) or {}
    id_ml = data.get('user_id')
    print("🔔 Notificação de mensagens recebida:", data)
    # 1) Sempre persistir e ACK rápido
    with get_db_connection() as conn, conn.cursor() as cur:
        cur.execute('SELECT usuario_id from contas_mercado_livre WHERE id_ml=%s', (id_ml,))
        usuario_id_dict = cur.fetchone()
        user_id = usuario_id_dict['usuario_id']
        cur.execute(
            "INSERT INTO notification (notificacao, topic) VALUES (%s, %s)",
            (json.dumps(data), str(data.get('topic','')))
        )

    # 2) Se há sync em andamento para esse usuário, não processe agora
    if user_id is not None:
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(%s) AS got", (int(user_id),))
            got = cur.fetchone()["got"]
        if not got:
            return jsonify({"status": "queued"}), 202
        # liberar imediatamente (foi só teste de lock)
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", (int(user_id),))

    # 3) disparar processamento leve em background
    socketio.start_background_task(processar_notificacao_ml, data, user_id)
    return jsonify({"status": "ok"}), 200

def processar_notificacao_ml(data: dict, user_id):
    with app.app_context():
        id_ml = data.get('user_id')
        # tente respeitar exclusividade por usuário
        got_lock = False
        if user_id is not None:
            got_lock = sync_lock_acquire(int(user_id))
            if not got_lock:
                app.logger.info(f"[notif] sync em andamento para {user_id}; notificação já persistida, saindo.")
                return
        try:
            now = datetime.utcnow()

            # renovar token se expirado e pegar credenciais
            with get_db_connection() as conn, conn.cursor() as cur:
                cur.execute("""
                    SELECT expiracao_token, refresh_token
                    FROM contas_mercado_livre
                    WHERE id_ml = %s
                """, (id_ml,))
                row = cur.fetchone()

                if row and row.get("expiracao_token") and now > row["expiracao_token"]:
                    app.logger.info("Token expirado, renovando...")
                    dados = renovar_access_token(row["refresh_token"])
                    cur.execute("""
                        UPDATE contas_mercado_livre
                        SET acess_token=%s,
                            refresh_token=%s,
                            expiracao_token=%s
                        WHERE id_ml=%s
                    """, (dados["access_token"], dados["novo_refresh_token"],
                        dados["nova_expiracao"], id_ml))
                    conn.commit()

                cur.execute("""
                    SELECT acess_token, usuario_id
                    FROM contas_mercado_livre
                    WHERE id_ml = %s
                """, (id_ml,))
                cred = cur.fetchone()

            if not cred:
                app.logger.warning(f"[notif] credenciais não encontradas para id_ml={id_ml}")
                return

            topic = str(data.get('topic',''))

            if topic == 'messages':
                pos_venda_notifications(data, cred, json.dumps(data))
            elif topic == 'questions':
                pre_venda_notifications(data, cred)
            elif topic == 'items':
                itens_notifications(data, cred)
            elif topic == 'orders_v2':
                orders_notifications(data.get('resource', ''), cred, json.dumps(data))
            elif topic == 'public_offers':
                public_offers_notifications(data, cred)
            elif topic == 'post_purchase':
                claims_notifications(data, cred)    
            # elif topic == 'payments':
            #     payments_notifications(data, cred)

        except Exception as e:
            app.logger.exception("Erro no worker de notificação: %s", e)
        finally:
            if user_id is not None and got_lock:
                sync_lock_release(int(user_id))


def payments_notifications(data, acess_token_data):
    print("🔔 Notificação de envios recebida:", data)
    resource = data.get('resource', '')
    url_shipments = f"https://api.mercadolibre.com{resource}"



def public_offers_notifications(data, acess_token_data):
    print("🔔 Notificação de ofertas públicas recebida:", data)
    resource=data.get('resource', '')
    url_offers = f"https://api.mercadolibre.com{resource}"
    headers = {"Authorization": f"Bearer {acess_token_data['acess_token']}"}
    response = requests.get(url_offers, headers=headers)
    if response.status_code != 200 and response.status_code != 206:
        print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
        return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
    offer_data = response.json()
    item_id = offer_data.get('item_id')
    promotion_id = offer_data.get('promotion_id')
    user_id = acess_token_data['usuario_id']
    conn= get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM ponte_item_promotions WHERE AND promotion_id = %s", (promotion_id,))
    existing_offers = cur.fetchone()
    url_promocao = f'https://api.mercadolibre.com/seller-promotions/promotions/{promotion_id}?promotion_type={type_promotion}&app_version=v2'
    response = requests.get(url_promocao, headers=headers)
    if response.status_code not in [200]:
        print(f"Erro ao consultar promoções")
        return
    resposta = response.json()
    id_promotion = resposta.get('id', None)
    type_promotion = resposta.get('type', None)
    status = resposta.get('status', None)
    finish_date = resposta.get('finish_date')
    start_date = resposta.get('start_date', None)
    deadline = resposta.get('deadline_date', None)
    name = resposta.get('name', None)
    cur.execute('INSERT INTO promotion (id_promotion,type_promotion,status,finish_date,start_date,deadline_date,name, usuario_id_promotions) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',(id_promotion, type_promotion, status, finish_date, start_date, deadline, name,user_id,))
    conn.commit()
    if type_promotion == 'MARKET_PLACE_CAMPAIGN':
        benefits = resposta.get('benefits', {})
        if benefits:
            meli_percent = benefits.get('meli_percent', None)
            seller_percent = benefits.get('seller_percent', None)
            benefits_type = benefits.get('type', None)
            if existing_offers:
                print("Oferta já existe, atualizando dados.")
                cur.execute('''UPDATE market_place_campaign_type_promotion SET type_promotion = %s,
                type_benefits = %s,meli_percent = %s,seller_percent = %s WHERE id_promotion = %s AND usuario_id_marketplace_campaign_type_promotion = %s''',
                (type_promotion,benefits_type,meli_percent,seller_percent,id_promotion,user_id))
            else:
                print("Oferta não existe, inserindo dados.")
                cur.execute('INSERT INTO market_place_campaign_type_promotion (id_promotion, type_promotion, type_benefits, meli_percent,seller_percent,usuario_id_marketplace_campaign_type_promotion) VALULES (%s,%s,%s,%s,%s,%s)',(id_promotion, type_promotion, benefits_type, meli_percent, seller_percent,user_id,))

    elif type_promotion == 'PRE_NEGOTIATED' or type_promotion == 'UNHEALTHY_STOCK':
        offers = resposta.get('offers',[])
        for offer in offers:
            offer_id = offer.get('id', None)
            original_price = offer.get('original_price', None)
            new_price = offer.get('new_price', None)
            status_offer = offer.get('status', None)
            start_date_offer = offer.get('start_date', None)
            end_date_offer = offer.get('end_date', None)
            benefits = offer.get('benefits', {})
            meli_percent = benefits.get('meli_percent', None)
            seller_percent = benefits.get('seller_percent', None)
            benefits_type = benefits.get('type', None)
            if existing_offers:
                print("Oferta já existe, atualizando dados.")
                cur.execute('''UPDATE pre_negotiated_type_promotion SET type_promotion = %s,offer_id = %s,
                type_benefits = %s,meli_percent = %s,seller_percent = %s,start_date = %s,end_date = %s,status = %s,
                original_price = %s,new_price = %s WHERE id_promotion = %s AND usuario_id_pre_negotiated_type_promotion_offers = %s''',
                (type_promotion,offer_id,benefits_type,meli_percent,seller_percent,start_date_offer,end_date_offer,status_offer,
                original_price,new_price,id_promotion,user_id))
            else:
                cur.execute('''INSERT INTO pre_negotiated_type_promotion (id_promotion,type_promotion, 
                offer_id,type_benefits, meli_percent, seller_percent, start_date, end_date, status, 
                original_price, new_price, usuario_id_pre_negotiated_type_promotion_offers) 
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(id_promotion,type_promotion, offer_id, benefits_type, meli_percent, seller_percent, start_date_offer, end_date_offer, status_offer, original_price, new_price,user_id,))
    elif type_promotion == 'SELLER_COUPON_CAMPAIGN':
        sub_type = resposta.get('sub_type', None)
        fixed_amount = resposta.get('fixed_amount', None)
        min_purchase_amount = resposta.get('min_purchase_amount',None)
        max_purchase_amount = resposta.get('max_purchase_amount', None)
        coupon_code = resposta.get('coupon_code', None)
        redeems_per_user = resposta.get('redeems_per_user', None)
        budget = resposta.get('budget',None)
        remaining_budget = resposta.get('remaining_budget', None)
        used_coupons = resposta.get('used_coupons', None)
        fixed_percentage = resposta.get('fixed_percentage', None)
        if existing_offers:
            print("Oferta já existe, atualizando dados.")
            cur.execute('''UPDATE seller_coupon_type_promotion SET type_promotion = %s, sub_type = %s,
            fixed_amount = %s,min_purchase_amount = %s,max_purchase_amount = %s,
            coupon_code = %s,redeems_per_user = %s,budget = %s,remaining_budget = %s,used_coupons = %s,fixed_coupons = %s WHERE
            id_promotion = %s AND usuario_id_seller_coupon_type_promotion = %s''',(type_promotion,sub_type,fixed_amount,min_purchase_amount,
            max_purchase_amount,coupon_code,redeems_per_user,budget,remaining_budget,used_coupons,fixed_percentage,id_promotion,user_id))
        else:
            print("Oferta não existe, inserindo dados.")
            cur.execute('''INSERT INTO seller_coupon_type_promotion (id_promotion,type_promotion,sub_type, fixed_amount, min_purchase_amount, max_purchase_amount, coupon_code, redeems_per_user,
            budget, remaining_budget, used_coupons, fixed_coupons, usuario_id_seller_coupon_type_promotion) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(id_promotion,type_promotion,sub_type,
            fixed_amount,min_purchase_amount,max_purchase_amount,coupon_code,redeems_per_user, budget, remaining_budget, used_coupons, fixed_percentage, user_id,))

    elif type_promotion == 'VOLUME':
        buy_quantity = resposta.get('buy_quantity', None)
        pay_quantity= resposta.get('pay_quantity', None)
        allow_combination = resposta.get('allow_combination', None)
        sub_type = resposta.get('sub_type', None)
        if existing_offers:
            print("Oferta já existe, atualizando dados.")
            cur.execute('''UPDATE volume_type_promotion SET type_promotion = %s,buy_quantity = %s,pay_quantity = %s,sub_type = %s,
            allow_combination = %s WHERE id_promotion = %s AND usuario_id_volume_type_promotion = %s''',(type_promotion,buy_quantity,
            pay_quantity,sub_type,allow_combination,id_promotion,user_id))
        else:
            print("Oferta não existe, inserindo dados.")
            cur.execute('''INSERT INTO volume_type_promotion (id_promotion,type_promotion,buy_quantity, pay_quantity, sub_type, allow_combination, usuario_id_volume_type_promotion) VALUES (%s,%s,%s,%s,%s,%s,%s)''',
            (id_promotion, type_promotion, buy_quantity, pay_quantity, sub_type, allow_combination, user_id ,))
    url=f'https://api.mercadolibre.com/seller-promotions/promotions/{id_promotion}/items?promotion_type={type_promotion}&item_id={item_id}&app_version=v2'
    response = requests.get(url, headers=headers)
    if response.status_code != 200 and response.status_code != 206:
        print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
        return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
    item_promotion_data = response.json()
    results = item_promotion_data.get('results', [])
    if not results:
        print("Nenhum item encontrado na promoção.")
        return jsonify({"error": "Nenhum item encontrado na promoção"}), 404
    cur.execute("SELECT * FROM ponte_item_promotions WHERE promotion_id = %s AND item_id = %s AND usuario_id_ponte_item_promotions=%s", (id_promotion, item_id, user_id,))
    existing_item_promotion = cur.fetchone()
    for result in results:
        id_promotion_item = id_promotion
        item_id = result.get('id', None)
        status = result.get('status', None)
        price = result.get('price', None)
        original_price = result.get('original_price', None)
        min_discounted_price= result.get('min_discounted_price', None)
        max_discounted_price= result.get('max_discounted_price', None)
        suggested_discounted_price= result.get('suggested_discounted_price', None)
        start_date= result.get('start_date', None)
        end_date = result.get('end_date', None)
        sub_type = result.get('sub_type', None)
        offer_id = result.get('offer_id', None)
        meli_percentage = result.get('meli_percentage', None)
        seller_percentage = result.get('seller_percentage', None)
        buy_quantity = result.get('buy_quantity', None)
        pay_quantity = result.get('pay_quantity', None)
        allow_combination = result.get('allow_combination', None)
        fixed_amount = result.get('fixed_amount', None)
        fixed_percentage = result.get('fixed_percentage', None)
        top_deal_price = result.get('top_deal_price', None)
        discount_percentage = result.get('descount_percentage', None)
        if existing_item_promotion:
            cur.execute("""UPDATE ponte_item_promotions SET status = %s,price = %s,original_price = %s,min_discounted_price = %s,max_discounted_price = %s,
            suggested_discounted_price = %s,start_date = %s,end_date = %s,sub_type = %s,offer_id = %s,meli_percentage = %s,seller_percentage = %s,
            buy_quantity = %s,pay_quantity = %s,allow_combination = %s,fixed_amount = %s,fixed_percentage = %s,top_deal_price = %s,
            discount_percentage = %s WHERE id_promotion = %s AND item_id = %s AND usuario_id_ponte_item_promotions = %s""",(status,price,original_price,
            min_discounted_price,max_discounted_price,suggested_discounted_price,start_date,end_date,sub_type,offer_id,meli_percentage,seller_percentage,
            buy_quantity,pay_quantity,allow_combination,fixed_amount,fixed_percentage,top_deal_price,discount_percentage,id_promotion_item,item_id,user_id))

        else:
            cur.execute("""INSERT INTO ponte_item_promotions (id_promotion, item_id, status, price, original_price, 
                                min_discounted_price,max_discounted_price, suggested_discounted_price, start_date, end_date, sub_type, offer_id, meli_percentage, 
                                seller_percentage, buy_quantity, pay_quantity, allow_combination, fixed_amount, fixed_percentage, top_deal_price, 
                                discount_percentage, usuario_id_ponte_item_promotions) VALUES (%s, %s, %s, %s,%s, %s, %s, %s,%s, %s, %s, %s,%s, %s, %s, %s,%s, %s, %s, %s,%s,%s)""",(id_promotion_item, item_id, status, price, original_price, 
                                min_discounted_price,max_discounted_price ,suggested_discounted_price, start_date, end_date,sub_type, offer_id, meli_percentage, 
                                seller_percentage, buy_quantity, pay_quantity, allow_combination, fixed_amount, fixed_percentage, top_deal_price, 
                                discount_percentage, user_id,))


def claims_notifications(data, acess_token_data):
    print("🔔 Notificação de reclamações recebida:", data)
    conn= get_db_connection()
    cur = conn.cursor()
    resource = data.get('resource', '')
    url_claims = f"https://api.mercadolibre.com{resource}"
    headers= {"Authorization": f"Bearer {acess_token_data['acess_token']}"} 
    response = requests.get(url_claims, headers=headers)
    if response.status_code != 200 and response.status_code != 206:
        print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
        return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
    if response.status_code != 200 and response.status_code != 206:
        print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
        return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
    claim_data = response.json() 
    print('claim_data:', claim_data)
    claim_id = claim_data.get('id')
    resource_id= claim_data.get('resource')
    status= claim_data.get('status')
    tipo= claim_data.get('type')
    stage= claim_data.get('stage')
    parent_id= claim_data.get('parent_id')

    if resource_id=='order':
        resource_id = 'pack_id'
        order_id=claim_data.get("resource_id")
        cur.execute("SELECT pack_id FROM pedidos_resumo WHERE id_order=%s",(order_id,))
        pack_id_dict = cur.fetchone()
        pack_id = pack_id_dict['pack_id'] if pack_id_dict else None
    elif resource_id=='shipment':
        print('shipment')
        resource_id = 'pack_id'
        url_order_shipment=f"https://api.mercadolibre.com/shipments/{claim_data.get('resource_id', 0)}/items"
        response_order_shipment = requests.get(url_order_shipment, headers=headers)
        if response_order_shipment.status_code in [200,206]:
            order_data = response_order_shipment.json()
            order_id = order_data[0].get("order_id")
            print("Order ID:", order_id)
            cur.execute("SELECT pack_id FROM pedidos_resumo WHERE id_order=%s",(order_id,))
            pack_id_dict = cur.fetchone()
            pack_id = pack_id_dict['pack_id'] if pack_id_dict else None
            print(f"Pack ID encontrado: {pack_id}")
    else:
        pack_id= None

    reason_id = claim_data.get('reason', None)
    fulfilled= claim_data.get('fulfilled', False)
    quantity_type= claim_data.get('quantity_type', None)
    site_id= claim_data.get('site_id', None)
    date_created= claim_data.get('date_created', None)
    last_updated= claim_data.get('last_updated', None)
    comprador_id = None
    vendedor_id = None
    acoes_disponiveis = []

    players = claim_data.get("players", [])
    for player in players:
        if player["role"] == "complainant" and player["type"] == "buyer":
            comprador_id = player["user_id"]
        if player["role"] == "respondent" and player["type"] == "seller":
            vendedor_id = player["user_id"]
            acoes_disponiveis = [acao["action"] for acao in player.get("available_actions", [])]
    resolution = claim_data.get("resolution", {})
    if resolution:
        reason_resolution = resolution.get("reason", None)
        date_resolution = resolution.get("date", None)
        benefited = resolution.get("benefited",[]) 
        resolution_closed_by = resolution.get("closed_by", None)
        applied_coverage = resolution.get("applied_coverage", False)
        print("Motivo da resolução:", reason_resolution)
        print("Data da resolução:", date_resolution)
        print("Beneficiado:", benefited)
        print("Resolução fechada por:", resolution_closed_by)
        print("Cobertura aplicada:", applied_coverage)
    url_reason = f"https://api.mercadolibre.com/post-purchase/v1/claims/reasons/{reason_id}"
    response_reason = requests.get(url_reason, headers=headers)
    if response_reason.status_code != 200:
        print(f"❌ Erro ao buscar razão da reclamação {claim_id}: {response_reason.status_code}")
        reason = None
        nome_reason = None
        expected_solution = []
    else:
        reason_data = response_reason.json()
        #print(f'reason_data: {reason_data}')
        nome_reason = reason_data.get("name")
        #print(f"Nome da razão: {nome_reason}")
        settings = reason_data.get("settings", {})
        expected_solution = settings.get('expected_resolutions', [])
        print("Nome da razão:", nome_reason)
        print("Soluções esperadas:", expected_solution)

    #print('--------------------------------')
    url_details = f"https://api.mercadolibre.com/post-purchase/v1/claims/{claim_id}/detail"
    response_details = requests.get(url_details, headers=headers)

    if response_details.status_code != 200:
        print(f"❌ Erro ao buscar detalhes da reclamação {claim_id}: {response_details.status_code}")
        title = None
        due_date_detail = None
        description = None
        action_responsible = None
        problem= None
    else:
        details = response_details.json()
        #print(f'Details: {details}')
        title = details.get("title")
        due_date_detail = details.get("due_date")
        description = details.get("description")
        action_responsible = details.get("action_responsible")
        problem= details.get("problem")
        print("Problema:", problem)
        print("description:", description)
        print("due_date_detail:", due_date_detail)
        print("Title:", title)
        print("Action responsible:", action_responsible)
    print("ID da reclamação:", claim_id)
    print("resource_id:", resource_id)
    print("status:", status)
    print("tipo:", tipo)
    print("stage:", stage)
    print("parent_id:", parent_id)
    print("order_id:", order_id)
    print("pack_id:", pack_id)
    print("fulfilled:", fulfilled)
    print("quantity_type:", quantity_type)
    print("site_id:", site_id)
    print("date_created:", date_created)
    print("last_updated:", last_updated)
    print("ID do comprador:", comprador_id)
    print("ID do vendedor:", vendedor_id)
    print("Ações disponíveis:", acoes_disponiveis)
    cur.execute("SELECT * FROM reclamacoes WHERE claim_id = %s", (claim_id,))
    existing_claim = cur.fetchone()
    if existing_claim:
        print("Reclamação já existe, atualizando dados.")
        cur.execute("SELECT * FROM reclamacoes WHERE claim_id = %s", (claim_id,))
        data_reclamacao = cur.fetchone()
        print("Dados da reclamação existente:", data_reclamacao)
        cur.execute("""UPDATE reclamacoes SET resource_id = %s, status = %s, tipo = %s, stage = %s, parent_id = %s, pack_id = %s, reason_id = %s,
                    fulfilled = %s, quantity_type = %s, site_id = %s, date_created = %s, last_updated = %s,
                    comprador_id = %s, vendedor_id = %s, acoes_disponiveis=%s,name_reason=%s,expected_solutions=%s,problem=%s,
                    description=%s,due_date=%s,title=%s,action_responsible=%s WHERE claim_id = %s AND usuario_id_reclamacoes=%s""",
                    (resource_id, status, tipo, stage, parent_id, pack_id, reason_id,
                     fulfilled, quantity_type, site_id, date_created, last_updated,
                     comprador_id, vendedor_id, acoes_disponiveis,nome_reason,expected_solution,
                     problem, description,due_date_detail,title,action_responsible,
                     claim_id, acess_token_data['usuario_id']))
    else:
        print("Reclamação não existe, inserindo dados.")
        cur.execute('''
                    INSERT INTO reclamacoes (
                        claim_id, resource_id, status, tipo, stage, parent_id, pack_id, reason_id,
                    fulfilled, quantity_type, site_id, date_created, last_updated,
                        comprador_id, vendedor_id, acoes_disponiveis,name_reason,expected_solutions,problem,description,due_date,title,action_responsible,usuario_id_reclamacoes
                    )
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (claim_id) DO NOTHING
                ''', (
                claim_id, resource_id, status, tipo, stage, parent_id, pack_id, reason_id,
                fulfilled, quantity_type, site_id, date_created, last_updated,
                comprador_id, vendedor_id, acoes_disponiveis,nome_reason,expected_solution,problem, description, due_date_detail,title,action_responsible,acess_token_data['usuario_id'],
                ))
    conn.commit()
    conn.close()
    cur.close()

def orders_notifications(resource,acess_token, data_ant):
    print("🔔 Notificação de pedidos recebida:", resource)
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        headers = {"Authorization": f"Bearer {acess_token['acess_token']}"}
        url = f"https://api.mercadolibre.com/{resource}"
        response = requests.get(url, headers=headers)
        if response.status_code != 200 and response.status_code != 206:
            print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
            return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
        order_data = response.json()
        print('order_data:', order_data)
        id = order_data.get('id')
        cur.execute("SELECT id_order FROM pedidos_resumo WHERE id_order = %s", (id,))
        existing_order = cur.fetchone()
        date_created = order_data.get('date_created', None)
        date_closed = order_data.get('date_closed', None)
        date_approved = order_data.get('date_approved', None)
        last_updated = order_data.get('last_updated', None)
        total_amount = order_data.get('total_amount', None)
        paid_amount = order_data.get('paid_amount', None)


        order_data_payments = order_data.get('payments', [])
        payments = order_data_payments[0] 
        status = payments.get('status', None)
        shipping_cost = payments.get('shipping_cost', None)
        payment_method = payments.get('payment_method_id', None)
        payment_type = payments.get('payment_type', None)
        installments = payments.get('installments', None)
        installment_amount = payments.get('installment_amount', None)

        order_data_orders = order_data.get('order_items', [])
        order_items = order_data_orders[0] if order_data_orders else {}
        items = order_items.get('item',{})
        item_id = items.get('id', None)
        item_title = items.get('title', None)
        item_warranty = items.get('warranty', None)
        listing_type_id = items.get('listing_type_id', None)
        category_id = items.get('category_id', None)
        unit_price = items.get('unit_price', None)
        sale_fee = items.get('sale_fee', None)
        quantity = items.get('quantity', None)

        buyer_id = order_data.get('buyer', {}).get('id', None)
        tags = order_data.get('tags', [])
        fulfilled = order_data.get('fulfilled', False)
        pack_id = order_data.get('pack_id', None)
        if category_id:
            url_categoria=f"https://api.mercadolibre.com/categories/{category_id}"
            response= requests.get(url_categoria, headers=headers)
            if response.status_code in [200, 206]:
                categoria_data = response.json()
                category_name = categoria_data.get('name', 'Sem nome de categoria')
                print(f"Categoria ID: {category_id}, Nome da Categoria: {category_name}")
        else:
            category_name = 'Sem nome de categoria'

        if existing_order:
            print("Pedido já existe, atualizando dados.")
            cur.execute("SELECT * FROM pedidos_resumo WHERE id_order = %s", (id,))
            data_pedidos_resumo = cur.fetchone()
            print("Dados do pedido existente:", data_pedidos_resumo)
            cur.execute("""UPDATE pedidos_resumo SET date_created = %s, date_closed = %s, date_approved = %s, last_updated = %s, 
                        total_amount = %s, paid_amount = %s, status = %s, shipping_cost = %s, payment_method = %s, payment_type = %s, installments = %s,
                    installment_amount = %s, item_id = %s, item_title = %s, item_warranty = %s, listing_type_id = %s, category_name = %s, unit_price = %s, sale_fee = %s, quantity = %s, buyer_id = %s,
                    tags = %s, fulfilled = %s, pack_id = %s WHERE id_order = %s AND usuario_id_pedidos_resumo=%s""", (date_created, date_closed, date_approved, last_updated, total_amount, paid_amount, 
                    status, shipping_cost, payment_method, payment_type, installments, installment_amount, item_id, item_title, item_warranty, listing_type_id, category_name, unit_price, sale_fee,
                    quantity, buyer_id, tags, fulfilled, pack_id, id, acess_token['usuario_id'],))
            cur.execute("UPDATE notification SET dados_retornados_api = %s, especificacao = %s WHERE notificacao = %s", (json.dumps(order_data), 'dados_existentes',data_ant,))
        else:
            print("Pedido não existe, inserindo novo registro.")
            cur.execute("INSERT INTO packs (pack_id, usuario_id_packs) VALUES (%s, %s) ON CONFLICT (pack_id) DO NOTHING", (pack_id, acess_token['usuario_id'],))
            conn.commit()
            cur.execute("""INSERT INTO pedidos_resumo (id_order, date_created, date_closed, date_approved, last_updated, total_amount, paid_amount, status, shipping_cost,
                        payment_method, payment_type, installments, installment_amount, item_id, item_title, item_warranty, listing_type_id, category_id, unit_price, sale_fee, 
                        quantity, buyer_id, tags, fulfilled, pack_id, category_name, usuario_id_pedidos_resumo) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                        (id, date_created, date_closed, date_approved, last_updated, total_amount, paid_amount, status, shipping_cost, payment_method, payment_type, installments,
                        installment_amount, item_id, item_title, item_warranty, listing_type_id, category_id, unit_price, sale_fee, quantity, buyer_id, tags, fulfilled, pack_id, category_name, acess_token['usuario_id'],))
            cur.execute("UPDATE notification SET dados_retornados_api = %s, especificacao = %s WHERE notificacao = %s", (json.dumps(order_data), 'dados_novos',data_ant,))
        conn.commit()
        print("Dados do pedido inseridos ou atualizados com sucesso.")
    except Exception as e:
        print("Erro ao processar pedido:", str(e))
        return jsonify({"error": str(e)}), 500
    finally:
        # Garantir que conexão seja sempre fechada na ordem correta
        try:
            if 'cur' in locals():
                cur.close()
            if 'conn' in locals():
                conn.close()
        except:
            pass
    #mensagem=1
    #prompt='com base nessa table:{table_colunas}, e essa mensagem:{mensagem}, retorne uma query que busque uma resposta para a mensagem, nao necessariamente essa seria uma busca unica'
    #cur.execute(query)
    #prompt com base nessas informaçoes essa mensagem consegue ser respondida completamente ou precisa de uma nova busca em outra table, retorne uma resposta se caso nao precisar, e retornae outra query se precisar =


def pos_venda_notifications(data,acess_token_data, data_ant):
    print("🔔 Notificação de pós-venda recebida:", data)
    resource_id = data.get('resource')
    access_token = acess_token_data['acess_token']  # ou busque do banco
    url = f"https://api.mercadolibre.com/messages/{resource_id}?tag=post_sale"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    if response.status_code != 200 and response.status_code != 206:
        print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
        return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
    m = response.json()
    id_ml=472633863
    conn= get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT usuario_id FROM contas_mercado_livre WHERE id_ml=%s",(id_ml,))
    user_id = cur.fetchone()
    print('order_data:', m)
    cur.execute("UPDATE notification SET dados_retornados_api = %s WHERE notificacao = %s", (json.dumps(m),data_ant,))
    if isinstance(m.get('messages'), list):
        for i in m.get('messages'):
            message_resources = i.get('message_resources', [])
            for resource in message_resources:
                if resource.get('name') == 'packs':
                    print("entrou no packs: ", resource)
                    pack_id= resource.get('id')
                    break
            print("pack_id:", pack_id)
            autor_comp = i.get('from').get('user_id')
            if autor_comp!=id_ml:
                autor = 'cliente'
                client_id = autor_comp
            else:
                autor = 'vendedor'
                client_id = i.get('to').get('user_id')
            cliente_nome = 'eu'
            mensagem = i.get('text')
            message_date = i.get('message_date', {})
            data_envio = message_date.get('created')
            tipo = 'post_sale'
            read= message_date.get('read')
            if read :
                read = True
            message_moderation = i.get('message_moderation', {})
            status = message_moderation.get('status')
            is_first_message = i.get('conversation_first_message', False)
            cur.execute("SELECT message,item_id,date_created FROM messages WHERE usuario_id_messages=%s AND client_name=%s AND pack_id=%s",(user_id['usuario_id'],cliente_nome,pack_id,))
            mensagem_existente = set()
            data_envio_existente = set()
            for row in cur.fetchall():
                mensagem_existente.add(row['message'])
                data_envio_existente.add(row['date_created'])
            if m.get('message_date') and data_envio_existente and mensagem_existente:
                print("autor",autor)
                mensagem=m.get('text')
                if m.get('attachments'):
                    urls=[]
                    for atch in m.get('attachments'):
                        urls.append(atch.get('url'))
                message_date=m.get('message_date')
                data_envi=message_date['created']

                if data_envi in data_envio_existente and mensagem in mensagem_existente:
                    print("Mensagem já existe no banco de dados, não inserindo novamente.")
                    conn.close()
                    cur.close()
                    return
        cur.execute('SELECT message,author FROM messages WHERE pack_id = %s',(pack_id,))
        mensagens_contexto = cur.fetchall() 
        if not mensagens_contexto :
          mensagens_contexto_com_usuario = 'nao existe'    
        else:
            mensagens_contexto_com_usuario=''
            for mensagem in mensagens_contexto:
              mensagens_contexto_com_usuario += f"{mensagem['author']}: mensagem:{mensagem['message']}\n"
            print("data de envio:", data_envio)
            read_existe = message_date.get('read', False)
            read = True if read_existe else False
        cur.execute('INSERT INTO messages (usuario_id_messages,client_name,message,date_created,author,type,read,pack_id,is_first_message, status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(user_id['usuario_id'],cliente_nome,mensagem,data_envio,autor,tipo,read,pack_id,is_first_message, status))
        print("mensagem:", mensagem)
        print("data de envio:", data_envio)
        print("autor:", autor)
        print("cliente_nome:", cliente_nome)
        print("tipo:", tipo)
        print("is_first_message:", is_first_message)
        print("pack_id:", pack_id)
        print("read:", read)

        conn.commit()
        conn.close()
        cur.close()
    print("📩 Mensagem recebida:", mensagem)

    # Por exemplo, salvar no banco de dados ou emitir um socket para o front-end
def pre_venda_notifications(data, acess_token_data):
    print("🔔 Notificação de pré-venda recebida:", data)
    resource_id = data.get('resource')
    access_token = acess_token_data['acess_token']  # ou busque do banco
    url=f"https://api.mercadolibre.com{resource_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    if response.status_code != 200 and response.status_code != 206:
        print("Erro ao acessar a API do Mercado Livre:", response.status_code, response.text)
        return jsonify({"error": "Erro ao acessar a API do Mercado Livre"}), response.status_code
    m = response.json()
    print("Pergunta recebida:", m)
    conn= get_db_connection()
    cur = conn.cursor()
    buyer_id = m.get('from',{}).get('id',None)

    client_name = buscar_nome(buyer_id, access_token) if buyer_id else {'nickname': None}
    print("Nome do cliente:", client_name['nickname'])
    item_id = m.get('item_id')
    status = m.get('status')
    text = m.get('text')
    date_created = m.get('date_created')
    print("buyer_id:", buyer_id)
    print("item_id:", item_id)
    print("status:", status)
    print("text:", text)
    print("date_created:", date_created)
    cur.execute("INSERT INTO messages (usuario_id_messages, client_name, message, date_created, author, type, status, item_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (acess_token_data['usuario_id'], client_name['nickname'],text, date_created, 'cliente' , 'pre_sale', status, item_id,))
    conn.commit()
    conn.close()
    cur.close()
    print("Pergunta processada com sucesso:")


def itens_notifications(data,acess_token_data):
    try:
        print("🔔 Notificação de itens recebida:", data)
        resource_id = data.get('resource')
        conn= get_db_connection()
        cur = conn.cursor()
        headers = {"Authorization": f"Bearer {acess_token_data['acess_token']}"}
        url = f"https://api.mercadolibre.com/{resource_id}"
        try:
            response = requests.get(url, headers=headers, timeout=15)
            # levanta exceção para qualquer código != 2xx
            response.raise_for_status()
        except requests.RequestException as e:
            print("Erro ao acessar a API do Mercado Livre:", e)
            # Aqui você pode atualizar a tabela notification marcando erro, se quiser.
            return {"ok": False, "error": f"Erro ML API: {e}"}
        item_data = response.json()
        item_id = item_data.get('id')
        nome_item = item_data.get('title')
        quantidade= item_data.get('available_quantity', 0)
        preco=item_data.get('price')
        print('pegando descrição')
        url_descricao = f"https://api.mercadolibre.com/items/{item_id}/description"
        response_descricao = requests.get(url_descricao, headers=headers)
        resposta_descricao = response_descricao.json()
        descricao = resposta_descricao.get('plain_text', 'Descrição não disponível')
        imagens = item_data.get('pictures', [])
        imagem = [img['url'] for img in imagens] if imagens else ['Sem imagem'] 
        preco_original = item_data.get('original_price', preco)
        preco_base = item_data.get('base_price', preco)
        disponivel = True
        tipo_ad = item_data.get('listing_type_id')
        category_id = item_data.get('category_id')
        url_cateogira=f'https://api.mercadolibre.com/categories/{category_id}'
        categoria_dados= requests.get(url_cateogira, headers=headers)
        categoria_json = categoria_dados.json()
        categoria = categoria_json.get('name', 'N/A')
        print("item_id:", item_id)
        print("nome_item:", nome_item)
        print("quantidade:", quantidade)
        print("preco:", preco)
        print("descricao:", descricao)
        print("imagem:", imagem)
        print("preco_original:", preco_original)
        print("preco_base:", preco_base)
        print("disponivel:", disponivel)
        print("tipo_ad:", tipo_ad)
        print("categoria:", categoria)

        cur.execute("SELECT * FROM itens WHERE item_id = %s", (item_id,))
        item_realdict = cur.fetchall()
        if item_realdict:
            print("Item já existe no banco de dados, atualizando item.")
            cur.execute("""
        UPDATE itens SET nome_item = %s, quantidade = %s, preco = %s, descricao = %s, imagem = %s, preco_original = %s, preco_base = %s, disponivel = %s, tipo_ad = %s, categoria = %s
        WHERE item_id = %s AND usuario_id_item = %s             
    """,(nome_item,quantidade,preco,descricao,imagem,preco_original,preco_base,disponivel,tipo_ad,categoria,item_id,acess_token_data['usuario_id'],))
            print('Item atualizado com sucesso no banco de dados.')
            cur.execute("UPDATE notification SET dados_retornados_api = %s, especificacao = %s WHERE notificacao = %s", (json.dumps(item_data), 'item_existe',json.dumps(data),))
        else :
            print("Item não existe no banco de dados, inserindo item.")
            cur.execute("""
                        INSERT INTO itens (item_id, nome_item, quantidade, preco, descricao, imagem, preco_original, preco_base, disponivel, tipo_ad, categoria, usuario_id_item) 
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        """,(item_id,nome_item,quantidade,preco,descricao,imagem,preco_original,preco_base,disponivel,tipo_ad,categoria,acess_token_data['usuario_id'],))
            print('Item inserido com sucesso no banco de dados.')
            pegar_anuncio_novo(item_id, acess_token_data['acess_token'], acess_token_data['usuario_id'])
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True, "message": "Item processado com sucesso"}
    except Exception as e:
        print("Deu tudo errrado:", str(e))



def pegar_anuncio_novo(item_id, acess_token,user_id):
    try:
        print("Pegando anuncio novo")
        conn = get_db_connection()
        cur = conn.cursor()
        url = f"https://api.mercadolibre.com/advertising/product_ads/items/{item_id}"
        headers = {"Authorization": f"Bearer {acess_token}"}
        try:
            response = requests.get(url, headers=headers, timeout=15)
            response.raise_for_status()
        except requests.RequestException as e:
            print(f"Erro ao buscar anúncios promovidos para o item {item_id}: {e}")
            return
        data = response.json()
        listingtype_id = data.get('listing_type_id', 'N/A')
        price = data.get('price', 0.0)
        title = data.get('title', 'N/A')
        campanha_id = data.get('campaign_id', 'N/A')
        status = data.get('status', 'N/A')
        has_discount = data.get('has_discount', False)
        catalog_listing = data.get('catalog_listing', False)
        condition = data.get('condition', 'N/A')
        logistic_type = data.get('logistic_type', 'N/A')
        domain_id = data.get('domain_id', 'N/A')
        date_created = data.get('date_created', 'N/A')
        buy_box_winner = data.get('buy_box_winner', False)
        channel = data.get('channel', 'N/A')
        brand_value_id = data.get('brand_value_id', 'N/A')
        brand_value_name = data.get('brand_value_name', 'N/A')
        thumbnail = data.get('thumbnail', 'N/A')
        current_level = data.get('current_level', 'N/A')
        diferred_stock = data.get('diferred_stock', False)
        permalink = data.get('permalink', 'N/A')
        recomended = data.get('recommended', False)
        image_quality = data.get('image_quality', 'N/A')


        cur.execute('''
        INSERT INTO anuncios (id_anuncio ,item_id, listing_type_id, price, title, status, has_discount, catalog_listing, condition, logistic_type, domain_id, date_created, buy_box_winner, 
        channel, brand_value_id, brand_value_name, thumbnail, current_level, diferred_stock, permalink, recomended, image_quality, usuario_id_anuncios) VALUES 
        (%s ,%s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)''', (item_id,item_id ,listingtype_id, price, title, status, has_discount, catalog_listing, condition, 
        logistic_type, domain_id, date_created, buy_box_winner, channel, brand_value_id, brand_value_name, thumbnail, current_level, diferred_stock, permalink, recomended, image_quality, user_id,))
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Erro ao pegar anúncio novo: {str(e)}")
        return {"ok": False, "error": str(e)}





# LOGIN, SISTEMA DE VERIFICAÇÃO DE CONTA
@app.route('/user-login', methods=['POST'])
def user_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    agora=datetime.now()
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
                #getApiMercadoLivre(jwt_token)
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
        print("modo_automatico:", modo_automatico)
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
        if ml_response.status_code not in [200, 206]:
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

@socketio.on('connect')
def handle_connect():
    token = request.cookies.get('__Host-token')
    print('CONNECT host=', request.host)
    print('CONNECT cookies=', request.headers.get('Cookie'))
    if not token:
        print('conectado sem token')
        return 
    try:
        user_id = int(decode_token(token)['sub'])
        print('conectado')
    except Exception:
        return False  # rejeita a conexão se não autenticar 
      

@socketio.on('disconnect')
def handle_disconnect():
    print('usuario desconectado')


@socketio.on("getMensagens")
def getMensagens(payload):
    try:
        print("entrou no getMensagens")
        token=payload.get('token')
        tipo=payload.get("tipo")
        decoded_token=decode_token(token)
        user_id=payload.get('user_id', decoded_token.get('sub'))
        conn = get_db_connection()
        cur = conn.cursor()
        print("user_id:", user_id)
        print("tipo:", tipo)
        cur.execute("""
        SELECT cliente_nome, mensagem, data_envio, autor
        FROM mensagens_clientes
        WHERE usuario_id_mensagem = %s AND tipo = %s
        ORDER BY data_envio ASC
        """, (user_id, tipo))

        rows = cur.fetchall()

        cur.execute("SELECT DISTINCT ON (cliente_nome) cliente_nome,mensagem,data_envio,item_id,autor FROM mensagens_clientes WHERE usuario_id_mensagem=%s AND tipo=%s ORDER BY cliente_nome,data_envio DESC", (user_id,tipo))
        rows_clientes=cur.fetchall()



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
        print("data:", data)
        cur.close() 
        conn.close()
        emit("respostaGetMensagens",data, broadcast=True)

    except Exception as e:
        print("Erro ao pegar os dados:", str(e))



@socketio.on('mudarModo')
def mudar_modo_automatico(modo):
    try:
        print("Entrou no mudarModo")
        modo_automatico=modo.get('modo', False)
        print("modo_automatico:", modo_automatico)
        token=modo.get('token', None)
        decoded_token=decode_token(token)
        user_id=decoded_token.get('sub')
        conn=get_db_connection()
        cur=conn.cursor()
        cur.execute("UPDATE usuarios SET modo_automatico=%s WHERE id=%s",(modo_automatico,user_id,))
        conn.commit()
        cur.execute("SELECT acess_token FROM contas_mercado_livre WHERE usuario_id=%s",(user_id,))
        token_access=cur.fetchone()
        access_token=token_access['acess_token']
        cur.execute("SELECT id_ml FROM contas_mercado_livre WHERE usuario_id=%s",(user_id,))
        seller=cur.fetchone()
        seller_id=seller['id_ml']
        cur.close()

        conn.close()
        print(access_token)

        #t = threading.Thread(target=listar_todos_itens, args=(user_id,seller_id,access_token))
        #t.start()
        #t = threading.Thread(target=faturamento_por_pedidos, args=(user_id,))
        #t.start()
        #t = threading.Thread(target=promocoes, args=(user_id, access_token,seller_id))
        #t.start()
        #t = threading.Thread(target=listar_conversas_pos_venda, args=(user_id,seller_id,access_token))
        #t.start()
        #t = threading.Thread(target=reclamacoes, args=(access_token,user_id))
        #t.start()
        #t = threading.Thread(target=faturamento, args=(user_id,))
        #t.start()
        #t = threading.Thread(target=listar_conversas_pre_venda, args=(user_id,seller_id,access_token))
        #t.start()
        #t = threading.Thread(target=dados_vendedor, args=(access_token,user_id))
        #t.start()
        #t = threading.Thread(target=campanhas_e_anuncios, args=(user_id,access_token))
        #t.start()
        #chat('Conforme imagem do carregador e logo vou testar com o multímetro as baterias.','Lava Jato Portátil Alta Pressão Recarregável 2 Bateria Carro','Descrição: ATENÇÃO: Para o primeiro uso, conecte diretamente à torneira para remover o ar da máquina. Após isso, utilize normalmente no balde. Antes de usar o produto, carregue por 12 horas para uma carga completa. Transforme a limpeza em uma tarefa simples e sem esforço com a nossa Lavadora Jato Portátil de Alta Pressão, agora disponível para você! Seja em casa, no jardim, no carro ou em qualquer lugar que precise de uma limpeza poderosa, esta lavadora portátil é sua melhor aliada. Características Principais: -Alta Pressão Onde Você Precisa: Ajuste a intensidade conforme a necessidade da limpeza, de sujeiras leves a resistentes. -Portátil e Recarregável: Equipada com duas baterias recarregáveis para total liberdade de movimento. -Acessórios Completos: Bico extensor, dispenser de sabão, mangueira e mais para uma limpeza eficaz. -Fácil de Transportar e Armazenar: Guardada em uma maleta resistente e prática. -Ecológica e Econômica: Utilize apenas a quantidade necessária de água, evitando desperdícios. Conteúdo do Pacote: 1 Lavadora Jato Portátil de Alta Pressão 1 Filtro 2 Bicos (Alta Pressão/Spray) 1 Bico Extensor 1 Dispenser de Sabão 1 Mangueira 1 Fonte de Carregamento 2 Baterias 1 Maleta Resistente Ficha Técnica: -Consumo: 4L por minuto -Tensão do Carregador: 110V/220V (bivolt) -Bateria: 48v -Tempo de Recarga: 2-3 horas -Tempo de Uso: 1-3 horas -Funcionalidades: 3 -Bocal de Alta Pressão -Níveis de Pressão: Alto, Médio, Baixo - Com níveis de Pressão: Desde lavar carros até regar plantas. Material: Plástico com circuitos elétricos CUIDADOS: Quanto tempo dura a bateria? R: Até 1 hora. Esse modelo vem com os acessórios? R: Sim, com todos os descritos na descrição do produto. Qual é a pressão da máquina? R: 870 Psi de pressão. Pode usar com a mangueira em um balde com água? R: Sim, pode ser usada conectada à torneira ou em um balde com água. A carga dela é bivolt? R: Sim, o carregador pode ser usado em 110V ou 220V. A bateria vem junto e qual a amperagem dela? R: Sim, vem com a bateria de 4000mAh. Tensão do carregador: 110V/220V, 50Hz/60Hz. Vocês têm bateria separada? R: Sim temos, só solicitar o link ou ir em "Ver mais anúncios do vendedor" Não utilize sem água. Mantenha longe do alcance de crianças e animais. Evite contato com o corpo quando utilizada com altas pressões. Não desmonte o produto. Verifique o encaixe correto da bateria. Evite quedas do produto. Certifique-se de que o produto está devidamente carregado antes de usar.','Boa noite, recebi o produto, porém nao esta certo, na descricao diz que ele e de 48 volts, mas oque veio na verdade e de 21 volts',)
        #chat_novai_manager_separador_de_pergunta('quais produtos eu vendo melhor?',user_id)

    except Exception as e:
        print("Erro no mudarmodo:", str(e))

@socketio.on('getItens')
def getItens(data):
    try:
        token=data.get('token')
        decoded_token=decode_token(token)
        user_id=decoded_token.get('sub')
        conn=get_db_connection()
        cur=conn.cursor()
        cur.execute('SELECT item_id,nome_item,quantidade,preco,descricao,imagem,preco_original,preco_base FROM itens WHERE usuario_id_item=%s',(user_id,))
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
        print("user_id:", user_id)
        cliente_nome = data["cliente_nome"]
        mensagem     = data["mensagem"]
        autor        = data["autor"]
        item=data['item_id']
        data_envio   = datetime.now()
        tipo=data['tipo']
        print("mensagem enviada:", mensagem)
        print("cliente_nome:", cliente_nome)
        print("autor:", autor)
        print("item:", item)
        print("data_envio:", data_envio)
        print("tipo:", tipo)
        # 1) salva no banco
        conn = get_db_connection()
        cur  = conn.cursor()
        cur.execute("SELECT modo_automatico FROM usuarios WHERE id=%s",(user_id,))
        modo_row=cur.fetchone()
        modo=modo_row['modo_automatico'] if modo_row else False
        print("modo:", modo)
        cur.execute(
            "INSERT INTO mensagens_clientes (usuario_id_mensagem, cliente_nome, mensagem, data_envio, autor,tipo,item_id) VALUES (%s, %s, %s, %s,%s,%s,%s)",
            (user_id, cliente_nome, mensagem, data_envio, autor,tipo,item)
        )
        print("Mensagem salva no banco de dados")
        cur.execute("SELECT nome_item,descricao FROM itens WHERE item_id=%s",(item,))
        item_data = cur.fetchone()
        nome_item = item_data.get('nome_item','Item não encontrado')
        detalhes = item_data.get('descricao','Descrição não encontrada')
        conn.commit()
        cur.close()
        conn.close()

        # 2) Se veio do cliente, chama a OpenAI e emite a resposta
        if autor == "cliente":
            if modo:
                resposta = chat_pos_venda(mensagem,nome_item,detalhes)  # devolve só a string
                autor_resposta='vendedor'
            print("resposta do chat:",resposta)
            # opcional: também salvar no banco a resposta do assistente
            conn = get_db_connection()
            cur  = conn.cursor()
            cur.execute(
                "INSERT INTO mensagens_clientes (usuario_id_mensagem, cliente_nome, mensagem, data_envio, autor,tipo,item_id) VALUES (%s, %s, %s, %s, %s,%s,%s)",
                (user_id, cliente_nome, str(resposta), datetime.now(), autor_resposta,tipo,item)
            )
            conn.commit()
            cur.close()
            conn.close()
            payload={
                "user_id":user_id,
                "token":token,
                "tipo":tipo,
            }
            print("payload:", payload)
            # agora emite pro front-end
        # 3) Por fim, atualiza a lista completa de mensagens (se for esse seu fluxo)

        getMensagens(payload)

    except Exception as e:
        print("erro ao armazenar mensagem:", str(e))


def sync_lock_acquire(user_id: int) -> bool:
    with get_db_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT pg_try_advisory_lock(%s) AS got", (int(user_id),))
        row = cur.fetchone()
        return bool(row["got"])

def sync_lock_release(user_id: int):
    with get_db_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_unlock(%s) AS done", (int(user_id),))

###                         ###
### FUNÇÕES A SEREM CHAMADAS###
###                         ###
@socketio.on('pegar_dados_iniciais')
def pegar_dados_gerais():
    print('pegar_dados_geraisF')
    token = request.cookies.get("__Host-token")

    if not token:
        return False
    print('token', token)
    try:
        decoded = decode_token(token)
        user_id = int(decoded.get('sub'))
    except jwt.InvalidTokenError:
        return False
    room=f'user:{user_id}'
    join_room(room)
    print('token depois:', token)
    emit('guardar_token', {'token':token}, room=room)
    socketio.sleep(3)   
    socketio.start_background_task(run_pipeline, user_id, room)
    emit('status_loading', {'message': 'Iniciando sincronização...'}, room=room)

def run_pipeline(user_id, room):
    try:
        # garante exclusividade por usuário
        if not sync_lock_acquire(user_id):
            socketio.emit('status_loading',
                          {'message': 'Já existe sincronização em andamento.', 'status': False},
                          room=room)
            return

        # pegue tudo o que precisa em UMA consulta
        with get_db_connection() as conn, conn.cursor() as cur:
            cur.execute("""
                SELECT acess_token, id_ml
                FROM contas_mercado_livre
                WHERE usuario_id = %s
            """, (user_id,))
            row = cur.fetchone()

        if not row:
            socketio.emit('status_loading',
                          {'message': 'Conta não encontrada.', 'status': False},
                          room=room)
            return

        access_token = row['acess_token']
        seller_id    = row['id_ml']

        # etapas com yields para cooperar com eventlet
        socketio.emit('status_loading', {'message': 'Pegando itens do vendedor...'}, room=room)
        listar_todos_itens(user_id, seller_id, access_token)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Analisando anúncios e campanhas...'}, room=room)
        campanhas_e_anuncios(user_id, access_token)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Sincronizando dados do vendedor...'}, room=room)
        dados_vendedor(access_token, user_id)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Armazenando pedidos...'}, room=room)
        faturamento_por_pedidos(user_id)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Mensagens pós-venda...'}, room=room)
        listar_conversas_pos_venda(user_id, seller_id, access_token)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Perguntas pré-venda...'}, room=room)
        listar_conversas_pre_venda(user_id, seller_id, access_token)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Reclamações...'}, room=room)
        reclamacoes(access_token, user_id)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Promoções...'}, room=room)
        promocoes(user_id, access_token, seller_id)
        socketio.sleep(0)

        socketio.emit('status_loading', {'message': 'Concluído!','status':True}, room=room)

    except Exception as e:
        socketio.emit('status_loading',
                      {'message': f'Erro: {e}', 'status': False},
                      room=room)
    finally:
        sync_lock_release(user_id)



def buscar_item(item_id,access_token):
    url=f"https://api.mercadolibre.com/items/{item_id}"

    headers={
        "Authorization":f"Bearer {access_token}"
    }
    response=requests.get(url,headers=headers)
    return response.json()

def listar_conversas_pos_venda(user_id, seller_id, access_token):
    print("Entrou na função listar_conversas_pos_venda")
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT pack_id FROM pedidos_resumo WHERE usuario_id_pedidos_resumo = %s AND last_updated>= NOW() - INTERVAL '2 month'", (user_id,))
    pack_id_lista = cur.fetchall()
    pack_id_list = [pack['pack_id'] for pack in pack_id_lista]  # Convertendo para lista de tuplas
    headers = {"Authorization": f"Bearer {access_token}"}
    print("pack_id_list:", pack_id_list)
    for pack_id in pack_id_list:

        url = f"https://api.mercadolibre.com/messages/packs/{pack_id}/sellers/{seller_id}?mark_as_read=false&tag=post_sale"
        response = requests.get(url, headers=headers)
        data = response.json()
        print("data:", data)
        messages = data.get('messages')
        print("-------------------------------------------------------------")

        if messages and isinstance(messages, list):
            for message in messages:
                if message.get('text'):
                    from_user = message.get('from', {}).get('user_id')
                    to_user = message.get('to', {}).get('user_id')
                    author = 'buyer' if from_user != seller_id else 'seller'
                    client_id = from_user if author == 'buyer' else to_user
                    client_name = buscar_nome(client_id, access_token)

                    is_first_message = message.get('conversation_first_message', False)
                    text = message.get('text')
                    created_at = message.get('message_date', {}).get('created')
                    read_flag = message.get('message_date', {}).get('read') is not None
                    print("is_first_message:", is_first_message)
                    print("text:", text)
                    print("created_at:", created_at)
                    print("author:", author)
                    if text and created_at:
                        created_at_brazil = converter_zona_pro_brasil(created_at)

                        cur.execute('''
                            INSERT INTO messages (
                                client_name, message, date_created, author,
                                type, read, pack_id, is_first_message,usuario_id_messages
                            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ''', (
                            client_name['nickname'],
                            text,
                            created_at_brazil,
                            author,
                            'post_sale',
                            read_flag,
                            pack_id,
                            is_first_message,
                            user_id,
                        ))
                    conn.commit()
    cur.close()
    conn.close()



def reclamacoes(access_token, user_id):
    print("Entrou na função de reclamações")

    base_url = "https://api.mercadolibre.com"
    headers = {"Authorization": f"Bearer {access_token}"}
    offset = 0
    limit = 30
    conn = get_db_connection()
    cur = conn.cursor()

    while True:
        url = f"https://api.mercadolibre.com/post-purchase/v1/claims/search?status=opened&offset={offset}&limit={limit}"
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            print(f"❌ Erro ao buscar reclamações: {response.status_code}")
            break


        data_geral = response.json()
        data = data_geral.get("data", [])

        if not data:
            print("Nenhuma reclamação aberta encontrada ou limite de offset atingido.")
            break

        for claim in data:
            claim_id = claim.get("id")
            resource_id = claim.get("resource")
            if resource_id=='order':
                resource_id = 'pack_id'
                order_id=claim.get("resource_id")
                cur.execute("SELECT pack_id FROM pedidos_resumo WHERE id_order=%s",(order_id,))
                pack_id_dict = cur.fetchone()
                pack_id = pack_id_dict['pack_id'] if pack_id_dict else None
            elif resource_id=='shipment':
                print('shipment')
                resource_id = 'pack_id'
                url_order_shipment=f"https://api.mercadolibre.com/shipments/{claim.get('resource', 0)}/items"
                response_order_shipment = requests.get(url_order_shipment, headers=headers)
                if response_order_shipment.status_code in [200,206]:

                    order_data = response_order_shipment.json()
                    order_id = order_data.get("order_id")
                    cur.execute("SELECT pack_id FROM pedidos_resumo WHERE id_order=%s",(order_id,))
                    pack_id_dict = cur.fetchone()
                    pack_id = pack_id_dict['pack_id'] if pack_id_dict else None
                    print(f"Pack ID encontrado: {pack_id}")
            else :
                 pack_id= None


            status = claim.get("status")
            tipo = claim.get("type")
            stage = claim.get("stage")
            parent_id = claim.get("parent_id")  
            reason_id = claim.get("reason_id")
            fulfilled = claim.get("fulfilled")
            quantity_type = claim.get("quantity_type")
            site_id = claim.get("site_id")
            date_created = claim.get("date_created")
            last_updated = claim.get("last_updated")

            # Players
            comprador_id = None
            vendedor_id = None
            acoes_disponiveis = []

            players = claim.get("players", [])
            for player in players:
                if player["role"] == "complainant" and player["type"] == "buyer":
                    comprador_id = player["user_id"]
                if player["role"] == "respondent" and player["type"] == "seller":
                    vendedor_id = player["user_id"]
                    acoes_disponiveis = [acao["action"] for acao in player.get("available_actions", [])]
            #print(f"Reclamação ID: {claim_id}, Comprador ID: {comprador_id}, Vendedor ID: {vendedor_id}")
            #print(f"Status: {status}, Tipo: {tipo}, Stage: {stage}, Parent ID: {parent_id}")
            #print(f"Resource: {resource}, Reason ID: {reason_id}, Fulfilled: {fulfilled}")
            #print(f"Quantity Type: {quantity_type}, Site ID: {site_id}")
            #print(f"Date Created: {date_created}, Last Updated: {last_updated}")
            #print(f"Ações Disponíveis: {acoes_disponiveis}")
            #print("-------------------------------------------------------------")
            url_reason = f"{base_url}/post-purchase/v1/claims/reasons/{reason_id}"
            response_reason = requests.get(url_reason, headers=headers)
            if response_reason.status_code != 200:
                print(f"❌ Erro ao buscar razão da reclamação {claim_id}: {response_reason.status_code}")
                reason = None
            else:
                reason_data = response_reason.json()
                #print(f'reason_data: {reason_data}')
                nome_reason = reason_data.get("name")
                #print(f"Nome da razão: {nome_reason}")
                settings = reason_data.get("settings", {})
                expected_solution = settings.get('expected_resolutions', [])

            #print('--------------------------------')
            url_details = f"{base_url}/post-purchase/v1/claims/{claim_id}/detail"
            response_details = requests.get(url_details, headers=headers)

            if response_details.status_code != 200:
                print(f"❌ Erro ao buscar detalhes da reclamação {claim_id}: {response_details.status_code}")
            else:
                details = response_details.json()
                #print(f'Details: {details}')
                title = details.get("title")
                due_date_detail = details.get("due_date")
                description = details.get("description")
                action_responsible = details.get("action_responsible")
                problem= details.get("problem")


                print(f'**************************************')
             #Inserir no banco

            cur.execute('''
                INSERT INTO reclamacoes (
                    claim_id, resource_id, status, tipo, stage, parent_id, pack_id, reason_id,
                  fulfilled, quantity_type, site_id, date_created, last_updated,
                    comprador_id, vendedor_id, acoes_disponiveis,name_reason,expected_solutions,problem,description,due_date,title,action_responsible,usuario_id_reclamacoes
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (claim_id) DO NOTHING
            ''', (
               claim_id, resource_id, 'open', tipo, stage, parent_id, pack_id, reason_id,
               fulfilled, quantity_type, site_id, date_created, last_updated,
             comprador_id, vendedor_id, acoes_disponiveis,nome_reason,expected_solution,problem, description, due_date_detail,title,action_responsible,user_id,
            ))
            conn.commit()

        conn.commit()
        offset += limit
        time.sleep(0.2)
        #request para claims fechadas
    offset = 0
    while True:
        url = f"https://api.mercadolibre.com/post-purchase/v1/claims/search?status=closed&offset={offset}&limit={limit}"
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            print(f"❌ Erro ao buscar reclamações: {response.status_code}")
            break
        data_geral = response.json()
        data = data_geral.get("data", [])
        if not data or offset>300:
            print("Nenhuma reclamação fechada encontrada ou limite de offset atingido.")
            break
        for i,claim in enumerate(data):
            print ('i:', i)
            claim_id = claim.get("id")
            resource_id = claim.get("resource_id")
            if resource_id=='order':
                resource_id = 'pack_id'
                order_id=claim.get("resource")
                cur.execute("SELECT pack_id from pedidos_resumo WHERE order_id=%s",(order_id,))
                pack_id_dict = cur.fetchone()
                pack_id = pack_id_dict['pack_id'] if pack_id_dict else None
            elif resource_id=='shipment':
                print('shipment')
                resource_id = 'pack_id'
                url_order_shipment=f"https://api.mercadolibre.com/shipments/{claim.get('resource_id', 0)}/items"
                response_order_shipment = requests.get(url_order_shipment, headers=headers)
                if response_order_shipment.status_code in [200,206]:
                    order_data = response_order_shipment.json()
                    order_id = order_data.get("order_id")
                    cur.execute("SELECT pack_id from pedidos_resumo WHERE order_id=%s",(order_id,))
                    pack_id_dict = cur.fetchone()
                    pack_id = pack_id_dict['pack_id'] if pack_id_dict else None
                    print(f"Pack ID encontrado: {pack_id}")
            else :
                 pack_id= None
            status = claim.get("status")
            tipo = claim.get("type")
            stage = claim.get("stage")
            parent_id = claim.get("parent_id")
            reason_id = claim.get("reason_id")
            fulfilled = claim.get("fulfilled")
            quantity_type = claim.get("quantity_type")
            site_id = claim.get("site_id")
            date_created = claim.get("date_created")
            last_updated = claim.get("last_updated")
            resolution = claim.get("resolution", {})
            # Players
            comprador_id = None
            vendedor_id = None
            acoes_disponiveis = []
            print(i)

            players = claim.get("players", [])
            for player in players:
                if player["role"] == "complainant" and player["type"] == "buyer":
                    comprador_id = player["user_id"]
                if player["role"] == "respondent" and player["type"] == "seller":
                    vendedor_id = player["user_id"]
                    acoes_disponiveis = [acao["action"] for acao in player.get("available_actions", [])]

            reason = None
            resolution_date_created = None
            benefited = []
            closed_by = None
            apllied_coverage = False

            if resolution:
                reason = resolution.get("reason")
                resolution_date_created = resolution.get("date_created")
                benefited = resolution.get("benefited")
                closed_by = resolution.get("closed_by")
                apllied_coverage = resolution.get("applied_coverage", False)

            print(f"Reclamação ID : {claim_id})")
            url_reason = f"{base_url}/post-purchase/v1/claims/reasons/{reason_id}"
            response_reason = requests.get(url_reason, headers=headers)
            if response_reason.status_code != 200:
                print(f"❌ Erro ao buscar razão da reclamação {claim_id}: {response_reason.status_code}")
                reason = None
            else:
                reason_data = response_reason.json()
                #print(f'reason_data: {reason_data}')
                nome_reason = reason_data.get("name")

            #print('--------------------------------')



            url_details = f"{base_url}/post-purchase/v1/claims/{claim_id}/detail"
            response_details = requests.get(url_details, headers=headers)

            if response_details.status_code != 200:
                print(f"❌ Erro ao buscar detalhes da reclamação {claim_id}: {response_details.status_code}")
                title = None
                due_date_detail = None
                description = None
                action_responsible = None
                problem= None
            else:
                details = response_details.json()
                #print(f'Details: {details}')
                title = details.get("title")
                description = details.get("description")
                print(f'**************************************')



            # Inserir no banco
            cur.execute('''
                INSERT INTO reclamacoes (
                    claim_id, resource_id, status, tipo, stage, parent_id, pack_id, reason_id,
                    fulfilled, quantity_type, site_id, date_created, last_updated,
                    comprador_id, vendedor_id, acoes_disponiveis,name_reason, description, title,reason_resolution,
                    date_resolution, benefited, resolution_closed_by, apllied_coverage ,usuario_id_reclamacoes
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (claim_id) DO NOTHING
            ''', (
                claim_id, resource_id, status, tipo, stage, parent_id, pack_id, reason_id,
                fulfilled, quantity_type, site_id, date_created, last_updated,
                comprador_id, vendedor_id, acoes_disponiveis,nome_reason,description,title,reason,resolution_date_created,benefited,closed_by,apllied_coverage,user_id,
            ))
        time.sleep(0.2)
        offset += limit
        conn.commit()


    print("✅ Sincronização de reclamações finalizada com sucesso.")

def faturamento_por_pedidos(user_id):
    print("entrou no faturamento_por_pedidos")
    try:
        conn=get_db_connection()
        cur=conn.cursor()
        cur.execute("SELECT acess_token,id_ml FROM contas_mercado_livre WHERE usuario_id = %s", (user_id,))
        token_acess=cur.fetchone()
        access_token=token_acess['acess_token']
        id=token_acess['id_ml']

        url_pages=f"https://api.mercadolibre.com/orders/search?seller={id}"
        headers = {"Authorization": f"Bearer {access_token}"}
        response = requests.get(url_pages, headers=headers)
        resposta=response.json()
        print('chegou aqui')
        paging=resposta.get('paging')
        print('chegou paging')
        total_pages=paging.get('total')
        print('chegou total_pages: ', total_pages)
        for offset in range(0,total_pages,50):
            url = f"https://api.mercadolibre.com/orders/search?seller={id}&offset={offset}&limit=50&sort=date_desc"


            response = requests.get(url, headers=headers)
            if response.status_code not in [200, 206]:
                print("Erro ao buscar pedidos:", response.text)
                return []
            orders = response.json()
            results = orders.get("results", [])

            for result in results:
                payments = result.get("payments", [])
                row_payments = payments[0] if payments else {}
                print("entrou no for de payments")
                id_order = row_payments.get('order_id')
                status = row_payments.get('status')
                paid_amount = row_payments.get('total_paid_amount', 0)
                installment = row_payments.get('installments', 0)
                installment_amount = row_payments.get('installment_amount', 0)        
                date_approved = row_payments.get('date_approved', 'Sem data')
                payment_type = row_payments.get('payment_type', 'Sem tipo de pagamento')
                available_actions = row_payments.get('available_actions', [])
                coupon_id = row_payments.get('coupon_id', 'Sem cupom')
                coupon_amount = row_payments.get('coupon_amount', 0)
                taxes_amount = row_payments.get('taxes_amount', 0)
                shipping_cost = row_payments.get('shipping_cost', 0)
                overpaid_amount = row_payments.get('overpaid_amount', 0)
                payment_method_id = row_payments.get('payment_method_id', 'Sem método de pagamento')
                #print(f"id_payment = {id_payment}, id_order = {id_order}, status = {status}, transaction_amount = {transaction_amount}")
                #print(f"total_paid_amount = {total_paid_amount}, installment = {installment}, installment_amount = {installment_amount}")
                #print(f"date_created = {date_created}, date_approved = {date_approved}, date_last_modified = {date_last_modified}")
                #print(f"payment_type = {payment_type}, authorization_code = {autorization_code}, marketplace_fee = {marketplace_fee}")
                #print(f"available_actions = {available_actions}, coupon_id = {coupon_id}, coupon_amount = {coupon_amount}, taxes_amount = {taxes_amount}")
                #print(f"shipping_cost = {shipping_cost}, overpaid_amount = {overpaid_amount}, payment_method_id = {payment_method_id}")
                order_items = result.get('order_items', [])
                row_order_items = order_items[0] if order_items else {}
                item = row_order_items.get('item', [])
                item_title = item.get('title', 'Sem título')
                quantity = row_order_items.get('quantity', 0)   
                unit_price = row_order_items.get('unit_price', 0)
                full_unit_price = row_order_items.get('full_unit_price', 0)
                sale_fee = row_order_items.get('sale_fee', 0)
                warranty = item.get('warranty', 'Sem garantia')
                condition = item.get('condition', 'Sem condição')
                item_id = item.get('id')
                cur.execute("SELECT item_id FROM itens WHERE item_id = %s AND usuario_id_item = %s",(item_id, user_id,))
                if not cur.fetchone():
                    cur.execute('INSERT INTO itens (item_id,nome_item,usuario_id_item) VALUES (%s,%s,%s) ON CONFLICT (item_id) DO NOTHING',(item_id,item_title,user_id,))
                    conn.commit()
                listing_type_id = row_order_items.get('listing_type_id', 'Sem tipo de listagem')
                #print(f"item_title = {item_title}, quantity = {quantity}, unit_price = {unit_price}")
                #print(f"full_unit_price = {full_unit_price}, sale_fee = {sale_fee}, warranty = {warranty}")
                #print(f"condition = {condition}, item_id = {item_id}")


                fulfilled = result.get('fulfilled', False)
                if not fulfilled:
                    print("fulfilled = False, continuando...")

                date_created_order = result.get('date_created', 'Sem data de criação')
                date_created_order_dt=datetime.fromisoformat(date_created_order).astimezone(timezone.utc)
                days_90=datetime.now(timezone.utc) - timedelta(days=90)
                if date_created_order_dt < days_90:
                    return
                print(f'date_created_order: {date_created_order}')
                date_closed = result.get('date_closed', 'Sem data de fechamento')

                date_last_updated_order = result.get('date_last_updated', 'Sem data de atualização')
                total_amount = result.get('total_amount', 0)
                paid_amount = result.get('paid_amount', 0)
                pack_id = result.get('pack_id', None)
                print('pack_id:', pack_id)
                if not pack_id:
                   pack_id = id_order
                print(f"pack_id depois = {pack_id}")
                cur.execute("INSERT INTO packs (pack_id,usuario_id_packs) VALUES (%s,%s) ON CONFLICT (pack_id) DO NOTHING", (pack_id,user_id,))
                conn.commit()
                if item.get('category_id'):
                    url_categoria=f"https://api.mercadolibre.com/categories/{item.get('category_id')}"
                    response= requests.get(url_categoria, headers=headers)
                    if response.status_code in [200, 206]:
                        categoria_data = response.json()
                        category_id = categoria_data.get('id', 'Sem categoria')
                        category_name = categoria_data.get('name', 'Sem nome de categoria')
                        print(f"Categoria ID: {category_id}, Nome da Categoria: {category_name}")
                else:
                    category_id = 'Sem categoria'
                    category_name = 'Sem nome de categoria'
                #print(f"fulfilled = {fulfilled}")
                #print(f"date_created_order = {date_created_order}, date_closed = {date_closed}, date_last_updated_order = {date_last_updated_order}")
                #print(f"total_amount = {total_amount}, paid_amount = {paid_amount}")
                try:
                    cur.execute('''INSERT INTO pedidos_resumo (id_order, date_created, date_closed, date_approved, last_updated, status, total_amount, paid_amount, shipping_cost, payment_method,
                                 payment_type, installments, installment_amount, item_id, item_title, item_warranty, listing_type_id, category_name, unit_price, sale_fee, quantity, buyer_id, tags, 
                                fulfilled, pack_id, usuario_id_pedidos_resumo) VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id_order) DO NOTHING''',(id_order, date_created_order, date_closed, date_approved, date_last_updated_order, status,
                                 total_amount, paid_amount, shipping_cost, payment_method_id, payment_type, installment, installment_amount,
                                 item_id, item_title, warranty, listing_type_id, category_name, unit_price, sale_fee, quantity, result.get('buyer', {}).get('id', 'Sem comprador'),
                                    result.get('tags', []), fulfilled, pack_id, user_id,))
                    conn.commit()

                except Exception as e:
                    print(f"Erro ao inserir pedido {id_order}: {e}")



        conn.close()
        #print('faturamento dos ultimos 50 pedidos: R$ ', faturamentos)

    except Exception as e:
        print("Erro no faturamento_ por pedidos:", str(e))

def faturamento(user_id):
    try:
        print('🔍 Entrou na função faturamento para o usuário:', user_id)

        # 🔌 Conexão e token
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT acess_token FROM contas_mercado_livre WHERE usuario_id = %s', (user_id,))
        token_access = cur.fetchone()
        access_token = token_access['acess_token']
        headers = {"Authorization": f"Bearer {access_token}"}

        # 🔄 Buscar todos os períodos disponíveis
        url_periodos = "https://api.mercadolibre.com/billing/integration/monthly/periods?group=ML&document_type=BILL&limit=12"
        response = requests.get(url_periodos, headers=headers)
        periodos_data = response.json()
        print(periodos_data)
        if 'results' not in periodos_data:
            print("❌ Nenhum período encontrado.")
            return

        # 📊 Iterar sobre os períodos
        for periodo in periodos_data['results']:
            key = periodo['key']  # Ex: "2024-12-01"
            print(f"\n📅 Período: {key}")

            # 🔧 ADICIONADO group=ML
            url_summary = f"https://api.mercadolibre.com/billing/integration/periods/key/{key}/summary/details?group=ML&document_type=BILL"


            response_summary = requests.get(url_summary, headers=headers)
            print("causa do erro: ", response_summary.text)

            if response_summary.status_code in [200, 206]:
                resumo = response_summary.json()
                if resumo:
                    resumo_period = resumo.get('period', '')
                    if resumo_period:
                        date_from = converter_zona_pro_brasil(resumo_period.get('date_from', 'Sem data'))
                        date_to = converter_zona_pro_brasil(resumo_period.get('date_to', 'Sem data'))
                        date_expiration = converter_zona_pro_brasil(resumo_period.get('expiration_date', 'Sem data de expiração'))
                        if resumo_period.get('debt_expiration_date'):
                            debt_expiration_date=converter_zona_pro_brasil(resumo_period.get('debt_expiration_date'))
                        else :
                            debt_expiration_date = None
                        period_status=resumo.get('period_status','')
                        print('Data de referencia: ', key)
                        print('📅 Data inicial do período:', date_from)
                        print('📅 Data final do período:', date_to)
                        print('📆 Data de expiração da fatura:', date_expiration)
                        print('data limite para pendencias de pagamento: ', debt_expiration_date)
                        print('status do periodo: ', period_status)
                    resumo_bill_includes = resumo.get('bill_includes', '')
                    if resumo_bill_includes:
                        print(resumo_bill_includes)
                        total_amount = resumo_bill_includes.get('total_amount', 'Sem total')
                        total_perception = resumo_bill_includes.get('total_perception', 'Sem total perception')
                        print('💰 Valor total faturado (total_amount):', total_amount)
                        print('📑 Total de percepções fiscais (total_perceptions):', total_perception)
                        #dentro de payment_collected#
                        payment_collected = resumo.get('payment_collected', {})
                        desconto_operacional = payment_collected.get('operation_discount', 'Sem desconto operacional')
                        total_payment = payment_collected.get('total_payment', 'Sem pagamento total')
                        total_credit_note = payment_collected.get('total_credit_note', 'Sem nota de crédito')
                        total_collected = payment_collected.get('total_collected', 'Sem total coletado')
                        total_debt = payment_collected.get('total_debt', 'Sem dívida restante')
                        print('🔻 Descontos operacionais (operation_discount):', resumo['payment_collected']['operation_discount'])
                        print('💵 Pagamento realizado (total_payment):', resumo['payment_collected']['total_payment'])
                        print('🧾 Notas de crédito recebidas (total_credit_note):', resumo['payment_collected']['total_credit_note'])
                        print('✅ Valor total efetivamente coletado (total_collected):', resumo['payment_collected']['total_collected'])
                        print('❗ Dívida restante (total_debt):', resumo['payment_collected']['total_debt'])
                        cur.execute('INSERT INTO faturas (key,date_from,date_to,date_expiration,debt_expiration_date,period_status,total_faturado,total_perception,descontos_operacionais,pagamento_realizado,total_credit_note,total_collected,total_debt) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(key,date_from,date_to,date_expiration,debt_expiration_date,period_status,total_amount,total_perception,desconto_operacional,total_payment,total_credit_note,total_collected,total_debt))
                        conn.commit()  
            else:
                print(f"⚠️ Erro ao obter resumo do período {key}: {response_summary.status_code}")

        cur.close()
        conn.close()
    except Exception as e:
        print('erro ao pegar faturamento :', e)



def listar_novas_conversas():
    print("Entrou na função listar_novas_conversas")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT usuario_id, acess_token FROM contas_mercado_livre")
    contas = cur.fetchall()
    for conta in contas:
        user_id = conta['usuario_id']
        access_token = conta['acess_token']
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        ml_response = requests.get("https://api.mercadolibre.com/users/me", headers=headers)
        response_ml=ml_response.json()
        id_ml=response_ml['id']
        print(f"Processando conta ID: {id}, User ID: {user_id}")
        try:
            listar_conversas_pre_venda(user_id,id_ml,access_token)
        except Exception as e:
            print(f"Erro ao listar conversas pré-venda para a conta ID {id}: {e}")
    cur.close()
    conn.close()

def dados_vendedor(access_token,user_id):
    print("Entrou na função dados_vendedor")
    url= "https://api.mercadolibre.com/users/me"
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    response = requests.get(url, headers=headers)
    if response.status_code not in [200, 206]:
        print("Erro ao buscar dados do vendedor:", response.text)
        return {}
    dados = response.json()
    #dados sensíveis do vendedor#
    id_ml = dados.get('id')
    first_name = dados.get('first_name', 'N/A')
    last_name = dados.get('last_name', 'N/A')
    email = dados.get('email', 'N/A')
    indentification= dados.get('identification', {})
    identification_number = indentification.get('number', 'N/A')
    identification_type = indentification.get('type', 'N/A')
    address_data = dados.get('address', {})
    state= address_data.get('state', 'N/A')
    city = address_data.get('city', 'N/A')
    address = address_data.get('address', 'N/A')
    zip_code = address_data.get('zip_code', 'N/A')
    phone_data = dados.get('phone', {})
    area_code = phone_data.get('area_code', 'N/A')
    phone_number = phone_data.get('number', 'N/A')
    verified=phone_data.get('verified', False)
    print("Dados sensíveis do vendedor: ")
    print(f"ID: {id_ml}, Nome: {first_name} {last_name}, Email: {email}")
    print(f"Identificação: {identification_type} {identification_number}, Endereço: {address}, {city}, {state}, CEP: {zip_code}")
    print(f"Telefone: {area_code} {phone_number}, Verificado: {verified}")
    print("---------------------------------------")
    conn = get_db_connection()
    cur=conn.cursor()

    #reputação do vendedor#
    seller_reputation = dados.get('seller_reputation', {})
    level_id = seller_reputation.get('level_id', 'N/A')
    power_seller_status = seller_reputation.get('power_seller_status', 'N/A')
    transactions = seller_reputation.get('transactions', {})
    period = transactions.get('period', 'N/A')
    total=transactions.get('total', 0)
    completed = transactions.get('completed', 0)
    canceled = transactions.get('canceled', 0)
    ratings = transactions.get('ratings', {})
    positive = ratings.get('positive', 0)
    neutral = ratings.get('neutral', 0)
    negative = ratings.get('negative', 0)
    tags= dados.get('tags', [])
    seller_experience = dados.get('seller_experience', 'N/A')
    print("Reputação do vendedor: ")
    print(f"Nível: {level_id}, Power Seller Status: {power_seller_status}")
    print(f"Período: {period}, Total de transações: {total}, Completadas: {completed}, Canceladas: {canceled}")
    print(f"Avaliações - Positivas: {positive}, Neutras: {neutral}, Negativas: {negative}")
    print(f"Tags: {', '.join(tags) if tags else 'Nenhuma'}, Seller Experience: {seller_experience}")
    print("---------------------------------------")
    #status da conta  e permições#
    status= dados.get('status', '{}')
    site_status = status.get('site_status', 'N/A')
    print("Status da conta e permissões: ")
    print(f"Site Status: {site_status}")
    print("---------------------------------------")

    #informações extras do vendedor#
    nickname = dados.get('nickname', 'N/A')
    registration_date = dados.get('registration_date', 'N/A')
    site_id = dados.get('site_id', 'N/A')
    permalink = dados.get('permalink', 'N/A')
    shipping_modes = dados.get('shipping_modes', [])
    logo= dados.get('logo', 'N/A')
    points=dados.get('points', 0)
    credit= dados.get('credit', {})
    consumed_credit = credit.get('consumed', 0)
    credit_level_id = credit.get('credit_level_id', 0)
    user_type = dados.get('user_type', 'N/A')
    print("Informações extras do vendedor: ")
    print(f"Nickname: {nickname}, Data de registro: {registration_date}, Site ID: {site_id}")
    print(f"Permalink: {permalink}, Shipping Modes: {', '.join(shipping_modes) if shipping_modes else 'Nenhum'}")
    print(f"Logo: {logo}, Pontos: {points}, Crédito consumido: {consumed_credit}, Nível de crédito: {credit_level_id}")
    print(f"Tipo de usuário: {user_type}")
    print("---------------------------------------")
    cur.execute('''INSERT INTO dados_vendedor (id_ml, first_name, last_name, email, identification_number, identification_type, state,
    city, address, zip_code, phone_number, verified, nickname, registration_date, site_id, permalink,shipping_modes, logo, usuario_id_dados_vendedor) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,%s,%s,%s,%s,%s,%s)''',
    (id_ml, first_name, last_name, email, identification_number, identification_type, state, city, address, zip_code, phone_number, verified,nickname, registration_date,site_id, permalink, shipping_modes, logo, user_id,)) 

    cur.execute('''INSERT INTO reputacao_vendedor (level_id, power_seller_status, period, total_transactions, completed_transactions, canceled_transactions, positive_reviews, neutral_reviews, negative_reviews, tags, seller_experience,credit_level_id, consumed_credit, user_type, usuario_id_reputacao_vendedor) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,%s)''',
    (level_id, power_seller_status, period, total, completed, canceled, positive, neutral, negative,tags, seller_experience,credit_level_id, consumed_credit, user_type, user_id,))

    cur.execute('UPDATE contas_mercado_livre SET site_status = %s WHERE usuario_id = %s', (site_status, user_id,))
    conn.commit()

    cur.close()
    conn.close()


def campanhas_e_anuncios(user_id, access_token):
    try:
        # Buscar anuncios
        print("Buscando anúncios do vendedor...")
        conn= get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT item_id FROM itens")
        itens = cur.fetchall()
        cont_certos = 0
        cont_errados = 0
        headers_url = {
            "Authorization": f"Bearer {access_token}",
            'api-version': '2',
        }
        campanhas = []
        item_ids = []
        for i,item in enumerate(itens):
            item_id = item['item_id']
            print(f"item_id: {item_id}")
            print (f'item {i}: ', end='')
            try:
                url = f"https://api.mercadolibre.com/advertising/product_ads/items/{item_id}"
                response = requests.get(url, headers=headers_url)
            except requests.exceptions.RequestException as e:
                print(f"Erro ao fazer requisição para o item {item_id}: {e}")
                cont_errados += 1
                continue

            if response.status_code not in [200, 206]:
                print(f"Erro ao buscar anúncios promovidos para o item {item_id}: {response.text}")
                continue
            cont_certos +=1
            data = response.json()
            listingtype_id = data.get('listing_type_id', 'N/A')
            price = data.get('price', 0.0)
            title = data.get('title', 'N/A')
            campanha_id = data.get('campaign_id', 'N/A')
            status = data.get('status', 'N/A')
            has_discount = data.get('has_discount', False)
            catalog_listing = data.get('catalog_listing', False)
            condition = data.get('condition', 'N/A')
            logistic_type = data.get('logistic_type', 'N/A')
            domain_id = data.get('domain_id', 'N/A')
            date_created = data.get('date_created', 'N/A')
            buy_box_winner = data.get('buy_box_winner', False)
            channel = data.get('channel', 'N/A')
            brand_value_id = data.get('brand_value_id', 'N/A')
            brand_value_name = data.get('brand_value_name', 'N/A')
            thumbnail = data.get('thumbnail', 'N/A')
            current_level = data.get('current_level', 'N/A')
            diferred_stock = data.get('diferred_stock', False)
            permalink = data.get('permalink', 'N/A')
            recomended = data.get('recommended', False)
            image_quality = data.get('image_quality', 'N/A')


            cur.execute('''
            INSERT INTO anuncios (id_anuncio ,item_id, listing_type_id, price, title, status, has_discount, catalog_listing, condition, logistic_type, domain_id, date_created, buy_box_winner, 
            channel, brand_value_id, brand_value_name, thumbnail, current_level, diferred_stock, permalink, recomended, image_quality, usuario_id_anuncios) VALUES 
            (%s ,%s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT (id_anuncio) DO NOTHING''', (item_id,item_id ,listingtype_id, price, title, status, has_discount, catalog_listing, condition, 
            logistic_type, domain_id, date_created, buy_box_winner, channel, brand_value_id, brand_value_name, thumbnail, current_level, diferred_stock, permalink, recomended, image_quality, user_id,))
            if not status == 'idle' and not campanha_id == 'N/A' and not campanha_id == 0 and (campanha_id not in campanhas):
                campanhas.append(campanha_id)
                item_ids.append(item_id)

            print('inseriu anúncio:', item_id)
            inicio = datetime.now() - timedelta(days=90)
            print('inicio',inicio)

            final = datetime.now() - timedelta(days=1)
            print('final',final)



            url = f"https://api.mercadolibre.com/advertising/product_ads/items/{item_id}?date_from={inicio.strftime('%Y-%m-%d')}&date_to={final.strftime('%Y-%m-%d')}&metrics=clicks,prints,ctr,cost,cpc,acos,organic_units_quantity,organic_units_amount,organic_items_quantity,direct_items_quantity,indirect_items_quantity,advertising_items_quantity,cvr,roas,sov,direct_units_quantity,indirect_units_quantity,units_quantity,direct_amount,indirect_amount,total_amount&aggregation_type=DAILY"
            response_summary = requests.get(url, headers=headers_url)
            if response_summary.status_code not in [200, 206]:
                print(f"Erro ao buscar resumo do anúncio {item_id}:", response_summary.text)
                return response_summary.status_code
            resumo_data = response_summary.json()

            results_resumo = resumo_data.get('results', [])
            for resumo in results_resumo:
                clicks = resumo.get('clicks', 0)
                prints = resumo.get('prints', 0)
                cost = resumo.get('cost', 0.0)
                cpc = resumo.get('cpc', 0.0)
                direct_amount = resumo.get('direct_amount', 0.0)
                indirect_amount = resumo.get('indirect_amount', 0.0)
                total_amount = resumo.get('total_amount', 0.0)
                direct_units_quantity = resumo.get('direct_units_quantity', 0)
                indirect_units_quantity = resumo.get('indirect_units_quantity', 0)
                units_quantity = resumo.get('units_quantity', 0)
                direct_items_quantity = resumo.get('direct_items_quantity', 0)
                indirect_items_quantity = resumo.get('indirect_items_quantity', 0)
                advertising_items_quantity = resumo.get('advertising_items_quantity', 0)
                organic_units_quantity = resumo.get('organic_units_quantity', 0)
                organic_items_quantity = resumo.get('organic_items_quantity', 0)
                acos = resumo.get('acos', 0.0)
                organic_units_amount = resumo.get('organic_units_amount', 0.0)
                sov = resumo.get('sov', 0.0)
                ctr = resumo.get('ctr', 0.0)
                cvr = resumo.get('cvr', 0.0)
                roas = resumo.get('roas', 0.0)
                date = resumo.get('date', 'N/A')    


                cur.execute('''
                INSERT INTO anuncios_metricas_diarias (id_anuncio, item_id, clicks, prints, cost, cpc, direct_amount, indirect_amount, total_amount,direct_units_quantity, 
                indirect_units_quantity, units_quantity,direct_items_quantity, indirect_items_quantity, advertising_items_quantity,organic_units_quantity, organic_items_quantity, acos,
                organic_amount,sov, ctr, cvr, roas, date,title, usuario_id_anuncios_metricas_diarias) VALUES (%s,%s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s,%s, %s, %s,%s, %s, %s, %s, %s,%s, %s, %s, %s, %s)
                ''', (
                item_id, item_id, clicks, prints, cost, cpc, direct_amount, indirect_amount, total_amount,direct_units_quantity, indirect_units_quantity, units_quantity,direct_items_quantity,
                indirect_items_quantity, advertising_items_quantity,organic_units_quantity, organic_items_quantity, acos, organic_units_amount,sov, ctr, cvr, roas, date, title, user_id,))
            conn.commit()
            print('----------------------------------------\n\n')


            headers_url = {
            "Authorization": f"Bearer {access_token}",
            'api-version': '2',
            }
            #campanhas ativas do vendedor#


        conn.commit()
        cur.execute("""DELETE FROM anuncios_metricas_diarias
                    WHERE id_anuncio IN (
                    SELECT id_anuncio
                    FROM anuncios_metricas_diarias
                    WHERE date >= NOW() - INTERVAL '90 days' AND usuario_id_anuncios_metricas_diarias = %s
                    GROUP BY id_anuncio
                    HAVING MAX(clicks) < 1
                    )
                    AND date >= NOW() - INTERVAL '90 days';
                    """, (user_id,))
        print(campanhas)
        print(item_ids)
        for i,campanha_id in enumerate(campanhas):

            item_id = item_ids[i]

            if campanha_id == 'N/A' or campanha_id == 0 or not campanha_id:
                    print(f"Campanha não encontrada {campanha_id}, continuando...")
                    continue

            url = f'''https://api.mercadolibre.com/advertising/product_ads/campaigns/{campanha_id}?date_from={inicio.strftime('%Y-%m-%d')}&date_to={final.strftime('%Y-%m-%d')}&metrics=clicks,prints,ctr,cost,cpc,acos,organic_units_quantity,organic_units_amount,organic_items_quantity,direct_items_quantity,indirect_items_quantity,advertising_items_quantity,cvr,roas,sov,direct_units_quantity,indirect_units_quantity,units_quantity,direct_amount,indirect_amount,total_amount,impression_share,top_impression_share,lost_impression_share_by_budget,lost_impression_share_by_ad_rank,acos_benchmark'''
            response_campanha = requests.get(url, headers=headers_url)
            if response_campanha.status_code not in [200, 206]:
                print(f"Erro ao buscar campanha {campanha_id}:", response_campanha.text)
                return response_campanha.status_code
            result = response_campanha.json()



            name = result.get('name', 'N/A')
            status = result.get('status', 'N/A')
            strategy = result.get('strategy', 'N/A')
            budget = result.get('budget', 0.0)
            automatic_budget = result.get('automatic_budget', False)
            currency_id = result.get('currency_id', 'N/A')
            last_updated = result.get('last_updated', 'N/A')
            date_created = result.get('date_created', 'N/A')
            channel= result.get('channel', 'N/A')
            acos_target = result.get('acos_target', 0.0)
            print(f"Campanha ID: {campanha_id}, Nome: {name}, Status: {status}, Estratégia: {strategy}")
            print(f"Orçamento: {budget}, Moeda: {currency_id}, Última atualização: {last_updated}")
            print(f"Data de criação: {date_created}, Canal: {channel}, ACOS Target: {acos_target}")
            print("---------------------------------------")
            cur.execute('INSERT INTO campanhas (campanha_id,nome,status,strategy,budget,currency_id,last_updated,date_created,channel,acos_target,usuario_id_campanhas) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (campanha_id) DO NOTHING',(campanha_id,name,status,strategy,budget,currency_id,last_updated,date_created,channel,acos_target,user_id,))
            conn.commit()
            cur.execute('UPDATE anuncios SET campanha_id = %s WHERE item_id = %s AND usuario_id_anuncios = %s', (campanha_id, item_id, user_id,))
            conn.commit()
            #metricas diarias por campanha
            if status == 'active':
                url_campanhas_diaria = f"""https://api.mercadolibre.com/advertising/product_ads/campaigns/{campanha_id}?date_from={inicio.strftime('%Y-%m-%d')}&date_to={final.strftime('%Y-%m-%d')}&metrics=clicks,prints,ctr,cost,cpc,acos,organic_units_quantity,organic_units_amount,organic_items_quantity,direct_items_quantity,indirect_items_quantity,advertising_items_quantity,cvr,roas,sov,direct_units_quantity,indirect_units_quantity,units_quantity,direct_amount,indirect_amount,total_amount,impression_share,top_impression_share,lost_impression_share_by_budget,lost_impression_share_by_ad_rank,acos_benchmark&aggregation_type=DAILY"""
                response_campanhas_diaria = requests.get(url_campanhas_diaria, headers=headers_url)
                if response_campanhas_diaria.status_code not in [200, 206]:
                    print("Erro ao buscar métricas diárias da campanha:", response_campanhas_diaria.text)
                    return response_campanhas_diaria.status_code
                campanhas_diaria_data = response_campanhas_diaria.json() 
                results_diaria = campanhas_diaria_data.get('results', [])
                for result_diaria in results_diaria:
                    clicks = result_diaria.get('clicks', 0)
                    prints = result_diaria.get('prints', 0)
                    cost = result_diaria.get('cost', 0.0)
                    cpc = result_diaria.get('cpc', 0.0)
                    ctr = result_diaria.get('ctr', 0.0)
                    direct_amount = result_diaria.get('direct_amount', 0.0)
                    indirect_amount = result_diaria.get('indirect_amount', 0.0)
                    total_amount = result_diaria.get('total_amount', 0.0)
                    direct_units_quantity = result_diaria.get('direct_units_quantity', 0)
                    indirect_units_quantity = result_diaria.get('indirect_units_quantity', 0)
                    units_quantity = result_diaria.get('units_quantity', 0)
                    direct_items_quantity = result_diaria.get('direct_items_quantity', 0)
                    indirect_items_quantity = result_diaria.get('indirect_items_quantity', 0)
                    advertising_items_quantity = result_diaria.get('advertising_items_quantity', 0)
                    organic_units_quantity = result_diaria.get('organic_units_quantity', 0)
                    organic_units_amount = result_diaria.get('organic_units_amount', 0.0)
                    organic_items_quantity = result_diaria.get('organic_items_quantity', 0)
                    acos = result_diaria.get('acos', 0.0)
                    cvr = result_diaria.get('cvr', 0.0)
                    roas = result_diaria.get('roas', 0.0)
                    sov = result_diaria.get('sov', 0.0)
                    impression_share = result_diaria.get('impression_share', 0.0)
                    top_impression_share = result_diaria.get('top_impression_share', 0.0)
                    lost_impression_share_by_budget = result_diaria.get('lost_impression_share_by_budget', 0.0)
                    lost_impression_share_by_ad_rank = result_diaria.get('lost_impression_share_by_ad_rank', 0.0)
                    acos_benchmark = result_diaria.get('acos_benchmark', 0.0)
                    date = result_diaria.get('date', 'N/A')
                    print(f"Data: {date}, Cliques: {clicks}, Impressões: {prints}, Custo: {cost}")
                    print(f"CPC: {cpc}, CTR: {ctr}, Quantidade de unidades diretas: {direct_units_quantity}, Quantidade de unidades indiretas: {indirect_units_quantity}")
                    print(f"Quantidade total de unidades: {units_quantity}, Quantidade de itens diretos: {direct_items_quantity}, Quantidade de itens indiretos: {indirect_items_quantity}")
                    print(f"Quantidade de itens publicitários: {advertising_items_quantity}, Quantidade de unidades orgânicas: {organic_units_quantity}, Quantidade de montante orgânico: {organic_units_amount}")
                    print(f"Quantidade de itens orgânicos: {organic_items_quantity}, ACOS: {acos}, CVR: {cvr}, ROAS: {roas}, SOV: {sov}")
                    print(f"Participação de impressões: {impression_share}, Participação de impressões no topo: {top_impression_share}")
                    print(f"Participação de impressões perdidas por orçamento: {lost_impression_share_by_budget}, Participação de impressões perdidas por classificação do anúncio: {lost_impression_share_by_ad_rank}")
                    print(f"ACOS Benchmark: {acos_benchmark}")



                    cur.execute('''
                    INSERT INTO campanhas_metricas_diarias (campanha_id, clicks, prints, cost, cpc, ctr, direct_amount, indirect_amount,
                    total_amount, direct_units_quantity, indirect_units_quantity, units_quantity,direct_items_quantity, indirect_items_quantity, advertising_items_quantity,
                    organic_units_quantity, organic_amount, organic_items_quantity, acos,cvr, roas, sov, impression_share, top_impression_share,
                    lost_impression_share_by_budget, lost_impression_share_by_ad_rank,acos_benchmark,nome, date, usuario_id_campanhas_metricas_diarias)
                    VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s,%s)''', (
                    campanha_id, clicks, prints, cost, cpc, ctr, direct_amount, indirect_amount,total_amount, direct_units_quantity, indirect_units_quantity, units_quantity,
                    direct_items_quantity, indirect_items_quantity, advertising_items_quantity,organic_units_quantity, organic_units_amount, organic_items_quantity, acos,
                    cvr, roas, sov, impression_share, top_impression_share,lost_impression_share_by_budget, lost_impression_share_by_ad_rank,acos_benchmark, name,date, user_id,))



        cur.execute("""DELETE FROM campanhas_metricas_diarias
                    WHERE campanha_id IN (
                    SELECT campanha_id
                    FROM campanhas_metricas_diarias
                    WHERE date >= NOW() - INTERVAL '90 days' AND usuario_id_campanhas_metricas_diarias = %s
                    GROUP BY campanha_id
                    HAVING MAX(clicks) < 1
                    )
                    AND date >= NOW() - INTERVAL '90 days';
                    """, (user_id,))
        conn.commit()
        conn.close()
        cur.close()

    except Exception as e:
        print(f"Erro ao buscar campanhas e anúncios: {e}")
        return 500

def campanhas_e_anuncios_periodico():
    print("Entrou na função campanhas_e_anuncios_periodico")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT usuario_id, acess_token, id_ml,expiracao_token FROM contas_mercado_livre")
    contas_data_dict = cur.fetchall()
    agora=datetime.now()
    for conta in contas_data_dict:
        expiracao_token = conta['expiracao_token']
        id_ml = conta['id_ml']
        if agora>expiracao_token:
            print("Token expirado, renovando...")
            print("verificou que o token expirou")
            cur.execute("SELECT refresh_token FROM contas_mercado_livre WHERE id_ml=%s",(id_ml,))
            refresh=cur.fetchone()
            dados=renovar_access_token(refresh["refresh_token"])
            print("retornando os dados:", dados)
            access_token=dados["access_token"]
            print(access_token)
            refresh=dados["novo_refresh_token"]
            print(refresh)
            expiracao=dados["nova_expiracao"]
            print(expiracao)
            cur.execute("UPDATE contas_mercado_livre SET acess_token=%s,refresh_token=%s,expiracao_token=%s WHERE id_ml=%s",(access_token,refresh,expiracao,id_ml,))
            conn.commit()
        else:
            access_token = conta['acess_token']
        usuario_id = conta['usuario_id']
        headers = {
            "Authorization": f"Bearer {access_token}",
            'api-version': '2',
        }
        cur.execute("SELECT item_id, nome_item FROM itens WHERE usuario_id_item = %s", (usuario_id,))
        itens_dict = cur.fetchall()
        ontem = agora - timedelta(days=1)
        for item in itens_dict:
            item_id = item['item_id']
            title = item['nome_item']
            print(f"Processando item_id: {item_id}")
            antes_de_ontem = agora - timedelta(days=2)
            print("ontem:", ontem)
            url = f"""https://api.mercadolibre.com/advertising/product_ads/items/{item_id}?date_from={ontem.strftime('%Y-%m-%d')}&date_to={ontem.strftime('%Y-%m-%d')}&metrics=clicks,prints,ctr,cost,cpc,acos,organic_units_quantity,organic_units_amount,organic_items_quantity,direct_items_quantity,indirect_items_quantity,advertising_items_quantity,cvr,roas,sov,direct_units_quantity,indirect_units_quantity,units_quantity,direct_amount,indirect_amount,total_amount&aggregation_type=DAILY"""
            response = requests.get(url,headers = headers)
            if response.status_code!=200 and response.status_code!=206:
                print('erro na chamada da api', response.text)
                continue
            resp = response.json()
            results_resumo=resp.get('results', [])
            for resumo in results_resumo:
                clicks = resumo.get('clicks', 0)
                prints = resumo.get('prints', 0)
                cost = resumo.get('cost', 0.0)
                cpc = resumo.get('cpc', 0.0)
                direct_amount = resumo.get('direct_amount', 0.0)
                indirect_amount = resumo.get('indirect_amount', 0.0)
                total_amount = resumo.get('total_amount', 0.0)
                direct_units_quantity = resumo.get('direct_units_quantity', 0)
                indirect_units_quantity = resumo.get('indirect_units_quantity', 0)
                units_quantity = resumo.get('units_quantity', 0)
                direct_items_quantity = resumo.get('direct_items_quantity', 0)
                indirect_items_quantity = resumo.get('indirect_items_quantity', 0)
                advertising_items_quantity = resumo.get('advertising_items_quantity', 0)
                organic_units_quantity = resumo.get('organic_units_quantity', 0)
                organic_items_quantity = resumo.get('organic_items_quantity', 0)
                acos = resumo.get('acos', 0.0)
                organic_units_amount = resumo.get('organic_units_amount', 0.0)
                sov = resumo.get('sov', 0.0)
                ctr = resumo.get('ctr', 0.0)
                cvr = resumo.get('cvr', 0.0)
                roas = resumo.get('roas', 0.0)
                date = resumo.get('date', 'N/A')

                cur.execute('''
                INSERT INTO anuncios_metricas_diarias (id_anuncio, item_id, title,clicks, prints, cost, cpc, direct_amount, indirect_amount, total_amount,direct_units_quantity, 
                indirect_units_quantity, units_quantity,direct_items_quantity, indirect_items_quantity, advertising_items_quantity,organic_units_quantity, organic_items_quantity, acos,
                organic_amount,sov, ctr, cvr, roas, date, usuario_id_anuncios_metricas_diarias) VALUES (%s,%s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s,%s, %s, %s,%s, %s, %s, %s, %s,%s, %s, %s, %s, %s)
                ''', (
                item_id, item_id, title,clicks, prints, cost, cpc, direct_amount, indirect_amount, total_amount,direct_units_quantity, indirect_units_quantity, units_quantity,direct_items_quantity,
                indirect_items_quantity, advertising_items_quantity,organic_units_quantity, organic_items_quantity, acos, organic_units_amount,sov, ctr, cvr, roas, date, usuario_id,))
            conn.commit()
            print('----------------------------------------\n\n')
        url='https://api.mercadolibre.com/advertising/advertisers?product_id=PADS'
        headers = {
            "Authorization": f"Bearer {access_token}",
            'api-version': '1',
            'Content-Type': 'application/json'
        }
        response = requests.get(url, headers=headers)
        advertisers = response.json()
        if response.status_code not in [200, 206]:
            print(f"Erro ao buscar anunciantes: {advertisers.get('message', 'Erro desconhecido')}")
            continue
        for advertiser in advertisers.get('advertisers', []):
            advertiser_id = advertiser.get('advertiser_id', 'N/A')
            print(f"Anunciante ID: {advertiser_id}")
            headers = {
            "Authorization": f"Bearer {access_token}",
            'api-version': '2',
        }
            url=f'https://api.mercadolibre.com/advertising/advertisers/{advertiser_id}/product_ads/campaigns?limit=1&offset=0'
            response = requests.get(url, headers = headers)
            resp = response.json()  
            paging = resp.get('paging', {})
            total_campanhas = paging.get('total', 0)
            for offset in range(0, total_campanhas):
                url=f'https://api.mercadolibre.com/advertising/advertisers/{advertiser_id}/product_ads/campaigns?limit=1&offset={offset}' 
                response = requests.get(url, headers = headers)
                if response.status_code not in [200, 206]:
                    print(f"Erro ao buscar campanhas do anunciante {advertiser_id} com offset {offset}: {response.text}")
                    continue
                resp = response.json()
                result= resp.get('results', [])
                for campanha in result:
                    print(f"Campanha: {campanha.get('id')}")
                    print("Nome da campanha: ", campanha.get('name', None))
                    campanha_id = campanha.get('id', None)
                    nome= campanha.get('name', None)
                    status = campanha.get('status', None)
                    strategy = campanha.get('strategy', None)
                    budget = campanha.get('budget', 0.0)
                    currency_id = campanha.get('currency_id', None)
                    last_updated = campanha.get('last_updated', None)
                    if last_updated:
                        last_updated = datetime.fromisoformat(last_updated.replace('Z','')).date()
                    print('last_updated', last_updated)
                    date_created = datetime.fromisoformat(campanha.get('date_created', None).replace('Z','')).date()
                    print('date_created',date_created)
                    print("ontem")
                    channel= campanha.get('channel', None)
                    acos_target = campanha.get('acos_target', 0.0)
                    if date_created.strftime('%Y-%m-%d') == ontem.strftime('%Y-%m-%d'):
                        print("Inserindo nova campanha no banco de dados")
                        cur.execute('''INSERT INTO campanhas (campanha_id,nome,status,strategy,budget,currency_id,last_updated,date_created,usuario_id_campanhas,channel,acos_target)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(campanha_id,nome,status,strategy,budget,currency_id,last_updated,date_created,usuario_id,acos_target,))
                        print(f'campanha: {campanha_id}, inserida com sucesso')
                    elif last_updated.strftime('%Y-%m-%d') == ontem.strftime('%Y-%m-%d'):
                        print(f"Atualizando campanha {campanha_id} com os dados mais recentes")
                        cur.execute('''UPDATE campanhas SET nome = %s, status = %s, strategy=%s,
                        budget = %s, last_updated = %s, channel = %s, acos_target = %s WHERE campanha_id = %s 
                        AND usuario_id_campanhas = %s''',(nome, status, strategy, budget, last_updated, channel, acos_target, campanha_id, usuario_id,))
                        print(f'campanha: {campanha_id}, atualizada com sucesso')
                    conn.commit()
                    #Campanhas Metricas diarias abaixo:
        cur.execute('SELECT campanha_id,nome FROM campanhas WHERE usuario_id_campanhas = %s', (usuario_id,))
        for campanhas in cur.fetchall():
            campanha_id = campanhas['campanha_id']
            nome = campanhas['nome']
            if status == 'active':
                url_campanhas_diaria = f"https://api.mercadolibre.com/advertising/product_ads/campaigns/{campanha_id}?date_from={ontem.strftime('%Y-%m-%d')}&date_to={ontem.strftime('%Y-%m-%d')}&metrics=clicks,prints,ctr,cost,cpc,acos,organic_units_quantity,organic_units_amount,organic_items_quantity,direct_items_quantity,indirect_items_quantity,advertising_items_quantity,cvr,roas,sov,direct_units_quantity,indirect_units_quantity,units_quantity,direct_amount,indirect_amount,total_amount,impression_share,top_impression_share,lost_impression_share_by_budget,lost_impression_share_by_ad_rank,acos_benchmark&aggregation_type=DAILY"
                response_campanhas_diaria = requests.get(url_campanhas_diaria, headers=headers)
                if response_campanhas_diaria.status_code not in [200, 206]:
                    print("Erro ao buscar métricas diárias da campanha:", response_campanhas_diaria.text)
                    return response_campanhas_diaria.status_code
                campanhas_diaria_data = response_campanhas_diaria.json() 
                results_diaria = campanhas_diaria_data.get('results', [])
                for result_diaria in results_diaria:
                    clicks = result_diaria.get('clicks', 0)
                    prints = result_diaria.get('prints', 0)
                    cost = result_diaria.get('cost', 0.0)
                    cpc = result_diaria.get('cpc', 0.0)
                    ctr = result_diaria.get('ctr', 0.0)
                    direct_amount = result_diaria.get('direct_amount', 0.0)
                    indirect_amount = result_diaria.get('indirect_amount', 0.0)
                    total_amount = result_diaria.get('total_amount', 0.0)
                    direct_units_quantity = result_diaria.get('direct_units_quantity', 0)
                    indirect_units_quantity = result_diaria.get('indirect_units_quantity', 0)
                    units_quantity = result_diaria.get('units_quantity', 0)
                    direct_items_quantity = result_diaria.get('direct_items_quantity', 0)
                    indirect_items_quantity = result_diaria.get('indirect_items_quantity', 0)
                    advertising_items_quantity = result_diaria.get('advertising_items_quantity', 0)
                    organic_units_quantity = result_diaria.get('organic_units_quantity', 0)
                    organic_units_amount = result_diaria.get('organic_units_amount', 0.0)
                    organic_items_quantity = result_diaria.get('organic_items_quantity', 0)
                    acos = result_diaria.get('acos', 0.0)
                    cvr = result_diaria.get('cvr', 0.0)
                    roas = result_diaria.get('roas', 0.0)
                    sov = result_diaria.get('sov', 0.0)
                    impression_share = result_diaria.get('impression_share', 0.0)
                    top_impression_share = result_diaria.get('top_impression_share', 0.0)
                    lost_impression_share_by_budget = result_diaria.get('lost_impression_share_by_budget', 0.0)
                    lost_impression_share_by_ad_rank = result_diaria.get('lost_impression_share_by_ad_rank', 0.0)
                    acos_benchmark = result_diaria.get('acos_benchmark', 0.0)
                    date = result_diaria.get('date', 'N/A')
                    print(f"Data: {date}, Cliques: {clicks}, Impressões: {prints}, Custo: {cost}")
                    print(f"CPC: {cpc}, CTR: {ctr}, Quantidade de unidades diretas: {direct_units_quantity}, Quantidade de unidades indiretas: {indirect_units_quantity}")
                    print(f"Quantidade total de unidades: {units_quantity}, Quantidade de itens diretos: {direct_items_quantity}, Quantidade de itens indiretos: {indirect_items_quantity}")
                    print(f"Quantidade de itens publicitários: {advertising_items_quantity}, Quantidade de unidades orgânicas: {organic_units_quantity}, Quantidade de montante orgânico: {organic_units_amount}")
                    print(f"Quantidade de itens orgânicos: {organic_items_quantity}, ACOS: {acos}, CVR: {cvr}, ROAS: {roas}, SOV: {sov}")
                    print(f"Participação de impressões: {impression_share}, Participação de impressões no topo: {top_impression_share}")
                    print(f"Participação de impressões perdidas por orçamento: {lost_impression_share_by_budget}, Participação de impressões perdidas por classificação do anúncio: {lost_impression_share_by_ad_rank}")
                    print(f"ACOS Benchmark: {acos_benchmark}")



                    cur.execute('''
                    INSERT INTO campanhas_metricas_diarias (campanha_id, nome,clicks, prints, cost, cpc, ctr, direct_amount, indirect_amount,
                    total_amount, direct_units_quantity, indirect_units_quantity, units_quantity,direct_items_quantity, indirect_items_quantity, advertising_items_quantity,
                    organic_units_quantity, organic_amount, organic_items_quantity, acos,cvr, roas, sov, impression_share, top_impression_share,
                    lost_impression_share_by_budget, lost_impression_share_by_ad_rank,acos_benchmark, date, usuario_id_campanhas_metricas_diarias)
                    VALUES (
                    %s, %s, %s, %s,%s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s, %s, %s,%s, %s, %s, %s, %s, %s)''', (
                    campanha_id, nome,clicks, prints, cost, cpc, ctr, direct_amount, indirect_amount,total_amount, direct_units_quantity, indirect_units_quantity, units_quantity,
                    direct_items_quantity, indirect_items_quantity, advertising_items_quantity,organic_units_quantity, organic_units_amount, organic_items_quantity, acos,
                    cvr, roas, sov, impression_share, top_impression_share,lost_impression_share_by_budget, lost_impression_share_by_ad_rank,acos_benchmark, date, usuario_id,))
                    conn.commit()



def promocoes(user_id, access_token,id_ml):
    print(f"Consultando promoções do usuário")
    conn= get_db_connection()
    cur = conn.cursor() 
    url_promocoes = f"https://api.mercadolibre.com/seller-promotions/users/{id_ml}?app_version=v2"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }
    TYPES_NO_DETAILS = ["DOD", "LIGHTNING", "PRICE_DESCOUNT",]
    response = requests.get(url_promocoes, headers=headers)
    respostas = response.json()
    if response.status_code not in [200,206]:
        print(f"Erro ao consultar promoções: {respostas.get('message', 'Erro desconhecido')}")
        return None
    paging= respostas.get('paging', {})
    total= paging.get('total', 0)
    limit= paging.get('limit', 0)
    print(f"Total de promoções encontradas: {total}, Limite por página: {limit}")
    for offset in range(0,total,limit):
        url_promocoes = f"https://api.mercadolibre.com/seller-promotions/users/{id_ml}?app_version=v2&offset={offset}&limit={limit}"
        response = requests.get(url_promocoes, headers=headers)
        if response.status_code not in [200, 206]:
            print(f"Erro ao consultar promoções com offset {offset}: {response.text}")
            continue
        respostas = response.json()
        for resposta in respostas.get('results', []):
            id_promotion = resposta.get('id', None)
            type_promotion = resposta.get('type', None)
            status = resposta.get('status', None)
            finish_date = resposta.get('finish_date')
            start_date = resposta.get('start_date', None)
            deadline = resposta.get('deadline_date', None)
            name = resposta.get('name', None)
            cur.execute('INSERT INTO promotion (id_promotion,type_promotion,status,finish_date,start_date,deadline_date,name, usuario_id_promotions) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id_promotion) DO NOTHING',(id_promotion, type_promotion, status, finish_date, start_date, deadline, name,user_id,))
            conn.commit()
            if type_promotion == 'MARKET_PLACE_CAMPAIGN':
                benefits = resposta.get('benefits', {})
                if benefits:
                    meli_percent = benefits.get('meli_percent', None)
                    seller_percent = benefits.get('seller_percent', None)
                    benefits_type = benefits.get('type', None)
                    cur.execute('INSERT INTO market_place_campaign_type_promotion (id_promotion, type_promotion, type_benefits, meli_percent,seller_percent,usuario_id_marketplace_campaign_type_promotion) VALULES (%s,%s,%s,%s,%s,%s)',(id_promotion, type_promotion, benefits_type, meli_percent, seller_percent,user_id,))

            elif type_promotion == 'PRE_NEGOTIATED' or type_promotion == 'UNHEALTHY_STOCK':
                offers = resposta.get('offers',[])
                for offer in offers:
                    offer_id = offer.get('id', None)
                    original_price = offer.get('original_price', None)
                    new_price = offer.get('new_price', None)
                    status_offer = offer.get('status', None)
                    start_date_offer = offer.get('start_date', None)
                    end_date_offer = offer.get('end_date', None)
                    benefits = offer.get('benefits', {})
                    meli_percent = benefits.get('meli_percent', None)
                    seller_percent = benefits.get('seller_percent', None)
                    benefits_type = benefits.get('type', None)
                    cur.execute('''INSERT INTO pre_negotiated_type_promotion_offers (id_promotion,type_promotion, 
                    offer_id,type_benefits, meli_percent, seller_percent, start_date, end_date, status, 
                    original_price, new_price, usuario_id_pre_negotiated_type_promotion_offers) 
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(id_promotion,type_promotion, offer_id, benefits_type, meli_percent, seller_percent, start_date_offer, end_date_offer, status_offer, original_price, new_price,user_id,))
            elif type_promotion == 'SELLER_COUPON_CAMPAIGN':
                sub_type = resposta.get('sub_type', None)
                fixed_amount = resposta.get('fixed_amount', None)
                min_purchase_amount = resposta.get('min_purchase_amount',None)
                max_purchase_amount = resposta.get('max_purchase_amount', None)
                coupon_code = resposta.get('coupon_code', None)
                redeems_per_user = resposta.get('redeems_per_user', None)
                budget = resposta.get('budget',None)
                remaining_budget = resposta.get('remaining_budget', None)
                used_coupons = resposta.get('used_coupons', None)
                fixed_percentage = resposta.get('fixed_percentage', None)
                cur.execute('''INSERT INTO seller_coupon_campaign_type_promotion (id_promotion,type_promotion,sub_type, fixed_amount, min_purchase_amount, max_purchase_amount, coupon_code, redeems_per_user,
                budget, remaining_budget, used_coupons, fixed_coupons, usuario_id_seller_coupon_campaign_type_promotion) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',(id_promotion,type_promotion,sub_type,
                fixed_amount,min_purchase_amount,max_purchase_amount,coupon_code,redeems_per_user, budget, remaining_budget, used_coupons, fixed_percentage, user_id,))

            elif type_promotion == 'VOLUME':
                buy_quantity = resposta.get('buy_quantity', None)
                pay_quantity= resposta.get('pay_quantity', None)
                allow_combination = resposta.get('allow_combination', None)
                sub_type = resposta.get('sub_type', None)
                cur.execute('''INSERT INTO volume_type_promotion (id_promotion,type_promotion,buy_quantity, pay_quantity, sub_type, allow_combination, usuario_id_volume_type_promotion) VALUES (%s,%s,%s,%s,%s,%s,%s)''',
                (id_promotion, type_promotion, buy_quantity, pay_quantity, sub_type, allow_combination, user_id ,))
            url = f'https://api.mercadolibre.com/seller-promotions/promotions/{id_promotion}/items?promotion_type={type_promotion}&app_version=v2'
            response = requests.get(url, headers=headers) 
            if response.status_code not in [200]:
                print(f"Erro ao buscar itens da promoção {id_promotion}: {response.text}")
                continue      
            resp = response.json()
            print(resp)
            if not resp.get('results', None):
                print(f"Nenhum item encontrado para a promoção {id_promotion} do tipo {type_promotion}")
                continue
            for result in resp.get('results'):
                id_promotion_item = id_promotion
                item_id = result.get('id', None)
                status = result.get('status', None)
                price = result.get('price', None)
                original_price = result.get('original_price', None)
                min_discounted_price= result.get('min_discounted_price', None)
                max_discounted_price= result.get('max_discounted_price', None)
                suggested_discounted_price= result.get('suggested_discounted_price', None)
                start_date= result.get('start_date', None)
                end_date = result.get('end_date', None)
                sub_type = result.get('sub_type', None)
                offer_id = result.get('offer_id', None)

                meli_percentage = result.get('meli_percentage', None)
                seller_percentage = result.get('seller_percentage', None)
                buy_quantity = result.get('buy_quantity', None)
                pay_quantity = result.get('pay_quantity', None)
                allow_combination = result.get('allow_combination', None)
                fixed_amount = result.get('fixed_amount', None)
                fixed_percentage = result.get('fixed_percentage', None)
                top_deal_price = result.get('top_deal_price', None)
                discount_percentage = result.get('descount_percentage', None)
                cur.execute("""INSERT INTO ponte_item_promotions (id_promotion, item_id, status, price, original_price, 
                            min_discounted_price,max_discounted_price, suggested_discounted_price, start_date, end_date, sub_type, offer_id, meli_percentage, 
                            seller_percentage, buy_quantity, pay_quantity, allow_combination, fixed_amount, fixed_percentage, top_deal_price, 
                            discount_percentage, usuario_id_ponte_item_promotions) VALUES (%s, %s, %s, %s,%s, %s, %s, %s,%s, %s, %s, %s,%s, %s, %s, %s,%s, %s, %s, %s,%s,%s)""",(id_promotion_item, item_id, status, price, original_price, 
                            min_discounted_price,max_discounted_price ,suggested_discounted_price, start_date, end_date,sub_type, offer_id, meli_percentage, 
                            seller_percentage, buy_quantity, pay_quantity, allow_combination, fixed_amount, fixed_percentage, top_deal_price, 
                            discount_percentage, user_id,))






    conn.commit()         
    cur.close()
    conn.close()   


def listar_novas_conversas_pos_venda():
    print("Entrou na função listar_novas_conversas_pos_venda")
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT usuario_id, acess_token FROM contas_mercado_livre")
    contas = cur.fetchall()
    for conta in contas:
        user_id = conta['usuario_id']
        access_token = conta['acess_token']
        headers = {
            "Authorization": f"Bearer {access_token}"
        }
        ml_response = requests.get("https://api.mercadolibre.com/users/me", headers=headers)
        response_ml=ml_response.json()
        id_ml=response_ml['id']
        print(f"Processando conta ID: {id_ml}, User ID: {user_id}")
        try:
            listar_conversas_pos_venda(user_id,id_ml,access_token)
        except Exception as e:
            print(f"Erro ao listar conversas pós-venda para a conta ID {id_ml}: {e}")


@app.route('/')
def home():
    return 'Flask rodando! (Função periódica em background)'

# Garante que o scheduler será desligado ao fechar a aplicação 

def listar_todos_itens(user_id,id,access_token):
    print("Entrou na função listar_todos_itens")
    url=f"https://api.mercadolibre.com/users/{id}/items/search"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    if response.status_code not in [200, 206]:
        print("Erro ao buscar itens:", response.text)
        return []
    itens = response.json()
    itens_paging = itens.get('paging', {})
    total = itens_paging.get('total', 0)
    limit = itens_paging.get('limit', 0)
    print("itens:", itens)
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT item_id FROM itens WHERE usuario_id_item=%s", (user_id,))
    itens_existentes = set()
    for linha in cur.fetchall():
        itens_existentes.add(linha['item_id'])
    print("Itens existentes no banco:", itens_existentes)
    for offset in range(0, total, limit):
        url=f"https://api.mercadolibre.com/users/{id}/items/search?offset={offset}&limit={limit}"
        response = requests.get(url, headers=headers)
        if response.status_code not in [200]:
            print(f"Erro ao buscar itens com offset {offset}: {response.text}")
            continue
        itens = response.json()
        for item_id in itens.get('results', []):
            if item_id not in itens_existentes:
                print(f"Item {item_id} não encontrado no banco, buscando detalhes...")
                url_item = f"https://api.mercadolibre.com/items/{item_id}"
                url_descricao = f"https://api.mercadolibre.com/items/{item_id}/description"
                response_descricao = requests.get(url_descricao, headers=headers)
                resposta_descricao = response_descricao.json()

                response_item = requests.get(url_item, headers=headers)
                if response_item.status_code not in [200, 206]:
                    print(f"Erro ao buscar item {item_id}: {response_item.status_code}")
                    continue
                resposta_itens = response_item.json()
                category_id = resposta_itens.get('category_id', 'N/A')
                url_cateogira=f'https://api.mercadolibre.com/categories/{category_id}'
                categoria_dados= requests.get(url_cateogira, headers=headers)
                categoria_json = categoria_dados.json()
                categoria = categoria_json.get('name', 'N/A')
                print('categoria do item: ', categoria)
                nome_item = resposta_itens.get('title', 'Sem título').strip()
                tipo_ad = resposta_itens.get('listing_type_id', 'sem tipo ad')
                print("Pegou o: ",tipo_ad)
                quantidade = resposta_itens.get('available_quantity', 0)
                preco = resposta_itens.get('price', 0.0)
                preco_original = resposta_itens.get('original_price', 0.0)
                preco_base = resposta_itens.get('base_price', 0.0)
                descricao = resposta_descricao.get('plain_text', 'Sem descrição')
                imagens = resposta_itens.get('pictures', [])
                imagem = [img['url'] for img in imagens] if imagens else ['Sem imagem']
                print(f"Item {item_id} encontrado: {nome_item}, Preço: {preco}, Quantidade: {quantidade}, Imagem: {imagem},preco_original: {preco_original}, preco_base: {preco_base}, descricao: {descricao}")
                try:
                    cur.execute(
                        'INSERT INTO itens (usuario_id_item, item_id, nome_item, quantidade, preco, descricao, imagem, preco_original, preco_base,disponivel,tipo_ad,categoria) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (item_id) DO NOTHING',
                        (user_id, item_id, nome_item, quantidade, preco, descricao, imagem, preco_original, preco_base,True,tipo_ad,categoria)
                    )
                    conn.commit()
                    print(f"Item {item_id} inserido com sucesso.")
                except Exception as e:
                    print(f"Erro ao inserir item {item_id} no banco: {e}")

def listar_conversas_pre_venda(user_id,id,access_token):
    print("entrou no listar_conversas")
    url = f"https://api.mercadolibre.com/questions/search?seller_id={id}&api_version=4"
    headers = {"Authorization": f"Bearer {access_token}"}
    response = requests.get(url, headers=headers)
    pages = response.json()
    if response.status_code not in [200, 206]:
        print("Erro ao buscar perguntas:", response.text)
        return []

    total_pages = pages.get("total", 0)
    print("Total de páginas:", total_pages)
    print("limite:", pages.get("limit", 50))
    for offset in range(0, total_pages, 50):
        url_recentes = f"https://api.mercadolibre.com/questions/search?seller_id={id}&api_version=4&limit=50&offset={offset}"
        respons = requests.get(url_recentes, headers=headers)
        time.sleep(0.3)  # Atraso de 300ms entre as requisições
        if respons.status_code not in [200, 206]:
            print("Erro ao buscar perguntas recentes:", respons.text)
            return []  
        conversas=respons.json()
        conn=get_db_connection()
        cur=conn.cursor()
        cur.execute("SELECT client_name, message FROM messages WHERE usuario_id_messages=%s AND type=%s",(user_id,'pre_sale',))
        clientes_existentes=[]
        mensagens_existentes=[]
        comparar=cur.fetchall()
        if comparar:
            clientes_existentes=[linha['client_name'] for linha in comparar]
            mensagens_existentes=[linha['message'] for linha in comparar]
        for m in conversas['questions']:
            if m:
                form=m.get('from')
                if isinstance(form , dict) and form.get("id"):
                    cliente_id=form.get('id')

                    cliente_nome = buscar_nome(cliente_id, access_token)
                if m.get('status'):
                    status = m.get('status', 'N/A')
                if m.get('item_id'):
                    item_id=m.get('item_id')
                if m.get('text') and m.get('date_created'):
                    mensagem = m['text']
                    data_envi = m['date_created']
                    data_envio = converter_zona_pro_brasil(data_envi)

                    if not comparar or (( cliente_id not in clientes_existentes) and  (mensagem not in mensagens_existentes)):
                        print("entrou no if da comp")
                        cur.execute(
                            "INSERT INTO messages (client_name,message,date_created,author,type,item_id,status,usuario_id_messages) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                            (cliente_nome['nickname'], mensagem, data_envio, 'cliente','pre_sale',item_id, status, user_id))

                answer = m.get('answer')
                if isinstance(answer, dict) and answer.get('text') and answer.get('date_created'):
                    resposta = answer['text']
                    status = answer.get('status', 'N/A')
                    data_envi = answer['date_created']
                    data_envio = converter_zona_pro_brasil(data_envi)
                    if not comparar or ((cliente_id not in clientes_existentes) and  (mensagem not in mensagens_existentes)):
                        cur.execute(
                        "INSERT INTO messages (client_name,message,date_created,author,type,item_id,status,usuario_id_messages) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                        (cliente_nome['nickname'], resposta, data_envio, 'bot|vendedor', 'pre_sale', item_id, status, user_id,)
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
    token = create_access_token(identity=str(user_id), expires_delta=timedelta(hours=2))
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
        nova_expiracao=datetime.now()+timedelta(seconds=expires_in)
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
    cur.execute("UPDATE contas_mercado_livre SET id_ml=%s WHERE usuario_id=%s",(id_ml,user_id,))
    conn.commit()
    cur.close()
    #listar_conversas_pos_venda(user_id,id_ml,access_token)
    #listar_conversas_pre_venda(user_id,id_ml,access_token)
    listar_todos_itens(user_id,id_ml,access_token)
    return True

import pytz
from dateutil import parser
def converter_zona_pro_brasil(ml_date):
    dt = parser.parse(ml_date)


    # Ajusta para o Brasil
    br_timezone = pytz.timezone('America/Sao_Paulo')
    return dt.replace(tzinfo=pytz.utc).astimezone(br_timezone)




def teste_itens_promovidos(access_token):
    print("Entrou na função teste_itens_promovidos")
    conn= get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT item_id FROM itens")
    itens = cur.fetchall()
    cont_certos = 0
    cont_errados = 0
    headers_url = {
        "Authorization": f"Bearer {access_token}",
        'api-version': '2',
    }
    for i,item in enumerate(itens):
        item_id = item['item_id']
        print(f"item_id: {item_id}")
        print (f'item {i}: ', end='')
        try:
            url = f"https://api.mercadolibre.com/advertising/product_ads/items/{item_id}"
            response = requests.get(url, headers=headers_url)
        except requests.exceptions.RequestException as e:
            print(f"Erro ao fazer requisição para o item {item_id}: {e}")
            cont_errados += 1
            continue

        if response.status_code not in [200, 206]:
            print(f"Erro ao buscar anúncios promovidos para o item {item_id}: {response.text}")
            continue
            cont_errados += 1
        cont_certos +=1
        data = response.json()
        listingtype_id = data.get('listing_type_id', 'N/A')
        price = data.get('price', 0.0)
        print(f"title", data.get('title', 'N/A'))
        print(f"status: {data.get('status', 'N/A')}")
        print(f"has_discount: {data.get('has_discount', 'N/A')}")
        print(f"condition : {data.get('condition')}, 'N/A')")
        print(f"Total de itens processados: {len(itens)}"
        f"\nItens com sucesso: {cont_certos} \nItens com erro: {cont_errados}")










def chat_pos_venda(mensagem: str, nome: str,descricao:str, contexto:str) -> str:
    print("entrou no chat")
    try:
      modelo=ChatOpenAI(model='gpt-4o-mini')
      if contexto == 'nao existe':
        prompt=ChatPromptTemplate.from_template('Você é um vendedor do mercado livre, responda a seguinte pergunta:{pergunta}, este é o nome do item:{nome} e a sua descricao:{descricao}')
        chain= prompt | modelo | StrOutputParser()
        print(chain.invoke({'pergunta': mensagem, 'nome':nome,'descrição':descricao}))
      else:
        prompt=ChatPromptTemplate.from_template('você é um vendedor do mercado livre, responda a seguinte pergunta :{pergunta},este é o nome do item:{nome} e a sua descricao:{descricao},  com base nesse contexto de conversa: {contexto}')
        chain= prompt | modelo | StrOutputParser()
        print(chain.invoke({'pergunta':mensagem,'nome':nome,'descricao':descricao,'contexto':contexto}))

    except Exception as e:
        print("Erro na OpenAI:", e)
        return ""


def chat_novai_manager_separador_de_pergunta():



    model = ChatOpenAI(model='gpt-4o-mini')
    prompt = ChatPromptTemplate.from_template('''
Você é um assistente que organiza perguntas feitas por vendedores do Mercado Livre para um sistema de IA que responde com base nos dados do vendedor.

Sua tarefa é:
- Identificar se há mais de uma pergunta.
- Verificar se as perguntas são dependentes (precisam ser respondidas juntas) ou independentes (podem ser respondidas separadamente).
- Juntar perguntas dependentes em uma só.
- Separar perguntas independentes e adicionar contexto se necessário.
- Devolver uma lista com as perguntas ajustadas.

Exemplos:

Usuário: "Qual meu item mais vendido na quarta-feira? Qual a sua descrição?"
Resposta: [ "Qual o nome e a descrição do meu item mais vendido na quarta-feira?" ]

Usuário: "Qual item eu mais recebo mensagem e qual item eu mais vendo no mês de julho."
Resposta: [
  "Qual item eu mais recebo mensagem no mês de julho?",
  "Qual item eu mais vendo no mês de julho?"
]

Agora analise a seguinte mensagem e retorne as perguntas ajustadas no formato de lista:
#{mensagem}
''')
    class EncaminharNeuronio(BaseModel):
        '''Separar mensagens inteligentemente'''
        resp: list[str] = Field(description='lista com as perguntas ajustadas')
    chain = prompt | model.with_structured_output(EncaminharNeuronio)
    resposta = chain.invoke({'mensagem':mensagem})
    print('resposta do primeiro neuronio: ', resposta)
    informacao_final=[]
    for i in resposta.resp:
        informacao_final.append(chat_novai_manager_pilot(i,user_id))
    prompt= ChatPromptTemplate.from_template('Você é um assistente de um vendedor do mercado livre, responda a mensagem:{mensagem} dele com base nos dados fornecidos: {mensagem_final} e deixe sua resposta bem robusta dando a resposta para a pergunta, mas se possivel complementaar a respostas caso tenha dados extras para deixaar a resposta mais colorida com mais dados.')
    chain= prompt | model | StrOutputParser()
    print('informação final:', informacao_final)
    resposta_final=chain.invoke({'mensagem_final':informacao_final, 'mensagem':mensagem})
    print("resposta final: ", resposta_final)
    return jsonify({'resposta_final':resposta_final})


def chat_novai_manager_pilot(pergunta : str, user_id : int):
    model = ChatOpenAI(model='gpt-4o-mini')
    prompt = ChatPromptTemplate.from_template('''
    dada a pergunta do vendedor do mercado livre,
    categorize a pergunta,
    simples: pode ser respondida de forma simples sem agregar dados do vendedor ou da api publica do mercado lire( normalmenlte prerguntas sobre regras do mercado livre, recomendações de como vender, ou ate mesmo duvidas sobre outros sistemas, etc...).
    dados_vendedor: resposta que precise pegar as informações do vendedor para ser respondidas ou que pelo menos ajude a responder o vendedor com seus dados atualizados;                 
    api publica do mercado livre: pergunta que precise de dados que nao sao do vendedor e é possível pegar pela api publica do mercado livre;
    Pergunta:{pergunta}
    analise a pergunta, pense em como ela poderia ser respondida, e conclua se seria importante mais infomrações para responde-la de forma personalizada e no final categorize.
    responda no maximo em 10 linhas
    ''')
    class EncaminharNeuronio(BaseModel):
        '''Categorize a pergunta'''
        resp: str = Field(description='Responda exatamente com: "api publica mercado livre", "dados_vendedor" ou "simples".')
    return_final = None
    def route(input):
        print("Primeiro neuronio: ",input.resp)
        nonlocal return_final
        if input.resp=='simples':
            chain_temp = model | StrOutputParser()
            resposta=chain_temp.invoke(f'Você é um assitente de vendedores do mercado livre responda apenas perguntas sobre esse assunto e se nao souber responde que nao sabe, mas nao de informação errada, pergunta: {pergunta}')
            print("resposta:",resposta)
            return_final = resposta
        elif input.resp=='dados_vendedor':

            return_final = chat_novai_manager_requisicao(pergunta,user_id)

        else:
            print("API do mercado livre resposta")
            return_final = "nao temos api do mercado livre "
    chain_TESTE = prompt | model | StrOutputParser()
    pensamento = chain_TESTE.invoke(pergunta)
    print(f'Resposta do Pilot Teste: \n{pensamento}')
    chain = model.with_structured_output(EncaminharNeuronio) | route
    chain.invoke(pensamento)
    print('return pilot:', return_final)
    return return_final





@app.route('/chat_novai_manager', methods=['POST'])
def chat_novai_manager_requisicao():
    data = request.get_json()
    print('entrou aqui no chat')
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
    except:
        return
    mensagem = data.get('message')
    print('token', token)
    if not user_id:
        return
    model = ChatOpenAI(model='gpt-4o-mini')
    descricao_db = '''
Descrição do banco de dados PostgreSQL:

Table "campanhas": armazena informações sobre campanhas publicitárias do vendedor, Utilização: acessar detalhes simples sobre estrutura da campanha - Relacionamentos : itens(N:1), campanhas_metricas_diarias(1:N), anuncios(1:N).

Table "campanhas_metricas_diarias": armazena métricas diárias de campanhas publicitárias, Utilização: acessar metricas da campanhas como cliques, prints, custo, - impression_share,top_impression_share,lost_impression_share_by_budget,lost_impression_share_by_ad_rank,acos_benchmark- Relacionamentos : campanhas(N:1).

Table "anuncios": armazena informações sobre anúncios de item ativos ou pausados, Utilização: acessar detalhes do anuncio ou nome do anuncio, status e estrutura do anuncio - Relacionamentos : itens(N:1), anuncios_metricas_diarias(1:N), campanhas(N:1).

Table "anuncios_metricas_diarias": armazena métricas diárias de anúncios, é mais completo que campanhas_metricas_diarias porque podem ter anuncios que nao estao em uma campanha, Utilização: quantidade de vendas por anuncios(pagos/product-ads) ou de forma organica ,acessar metricas do anuncio como cliques, prints, custo, organic_units_amount, organic_items_quantity etc - Relacionamentos : anuncios(N:1), itens(N:1).

Table "pedidos_resumo": todos os pedidos de clientes, Utilização: acessar pedidos de clientes, vendas, status, detalhes do pedido, itens_vendidos, categoria do item, etc. - Relacionamentos : itens(N:1), packs(N:1), reclamacoes(1:1) 

Table "itens": armazena informações e mais detalhes sobre itens disponíveis pelo vendedor, Utilização: detalhes do item - Relacionamentos : pedidos_resumo(1:N), anuncios(1:N), anuncios_metricas_diarias(1:N), mensagens_clientes(1:N).

Table "reputacao_vendedor": armazena informações sobre a reputação, numeros de transacoes, e avaliações do vendedor, Utilização: acessar reputação do vendedor, transações totais,canceladas,completas, experiencia do vendedor,informações de creditos, nivel de conta, etc.

Table "dados_vendedor": armazena informações gerais e sensiveis do vendedor, Utilização: acessar dados como nome, email, telefone, endereço etc. 

Table "packs": armazena pack_id. Utilização: relacionar mensagens com pedidos. RELACIONAMENTOS : mensagens_clientes(1:N), pedidos_resumo(1:N).

Table "reclamacoes" : armazena reclamações feitas por clientes, Utilização: acessar reclamações de clientes, detalhes sobre a reclamação, status, etc. - Relacionamentos: para relacionar ela com a table pedidos_resumo, use a table packs como ponte.

Table "messages": armazena mensagens trocadas entre o vendedor e o cliente, Utilização: acessar conversas com clientes pos e pre venda - Relacionamentos: para relacionar ela com a table pedidos_resumo, use a table packs como ponte.

Table "ponte_item_promotions": armazena informações sobre itens que estão em promoções, servindo como uma ponte entre a tabela de promoções e itens, Utilização: ligar promoções com itens específicos, acessar detalhes sobre promoções de itens, status e preços promocionais, etc. - Relacionamentos: promotion(N:1), itens(N:1).

Table "promotion": armazena informações sobre promoções ativas ou pendentes ou candidatas do vendedor, Utilização: acessar promoções do vendedor, detalhes sobre promoções, status, tipo de promoção, benefícios, etc.

Table "marketplace_campaign_type_promotion": armazena informações especificas sobre promoções do tipo "Marketplace Campaign", Utilização: acessar promoções do tipo "Marketplace Campaign" - Relacionamentos: promotion(N:1).

Table "pre_negotiated_type_promotion_offers": armazena informações especificas sobre promoções do tipo "Pre Negotiated", Utilização: acessar promoções do tipo "Pre Negotiated" - Relacionamentos: promotion(N:1).

Table "seller_coupon_campaign_type_promotion": armazena informações especificas sobre promoções do tipo "Seller Coupon Campaign", Utilização: acessar promoções do tipo "Seller Coupon Campaign" - Relacionamentos: promotion(N:1).
    
Table "volume_type_promotion": armazena informações especificas sobre promoções do tipo "Volume", Utilização: acessar promoções do tipo "Volume" - Relacionamentos: promotion(N:1).    
    '''
    guardar_mensagem=mensagem
    mensagem += '''
Você é apenas um neurônio em um cérebro. Sua função é decidir se existe alguma tabela no banco de dados que possa conter as informações necessárias para responder ou para agregar em uma futura resposta para essa pergunta.  
Se houver, diga qual/quais tabelas são. Se não houver, apenas diga que não é possível agregar dados do banco para essa pergunta.  
Seja extremamente direto.
    '''

    exemplos = [
        {
            "pergunta": "Como posso aumentar minhas vendas?",
            "pensamento": "analisando a descrição das tables, é possivel agregar essa informação atraves da table pedidos_resumo que contem informações dos pedidos e/ ou atraves da table anuncios_metricas_diarias que contem informações sobre os anuncios e suas metricas e vendas diarias"
        },
        {
            "pergunta": "qual minha senha do mercado livre",
            "pensamento": "analisando a descrição das tables,não é possível agregar essa informação atraves de nenhuma table"
        },
        {
            "pergunta": "Qual meu prazo para responder uma mensagem no pós-venda?",
            "pensamento": "analisando a descricao das tables, é possivel agregar a resposta através da table mensagens_clientes: q contem as mensagens e detalhes sobre as conversas com os clientes"
        },
        {
            "pergunta":"me mande qual item que mais vendi e a descricao dele",
            "pensamento":"analisando a descricao das tables e suas Relações, é possível agregar a resposta atraves de duas tables: 'pedidos_resumo' e 'itens'."
        }
    ]

    example_prompt = PromptTemplate(
        input_variables=["pergunta", "pensamento"],
        template="""Pergunta: {pergunta}
Pensamento: {pensamento}
"""
    )

    prompt = FewShotPromptTemplate(
        examples=exemplos,
        example_prompt=example_prompt,
        suffix="""
Pergunta nova: {input}
Base de Dados: {detalhes}
Responda com base apenas na descrição das tables.
""",
        input_variables=["input", "detalhes"]
    )

    final_prompt_text = prompt.format(input=mensagem, detalhes=descricao_db)
    class Simplificador(BaseModel):
        '''Decide se é possível agregar dados com as tabelas disponíveis.'''
        possibilidade: bool = Field(description="True se dá para buscar nas tabelas; False se não.")
        tables: Optional[List[str]] = Field(description='Lista com nomes exatos das tabelas, ex: ["pedidos_resumo","itens"]. Deixe como None se a possibilidade for false')
    return_final = None
    def route(out: Simplificador):
        nonlocal return_final
        print(f'output : {out}')
        if not out.possibilidade:
            print('\n--- Resposta direta do LLM (sem banco) ---\n')
            resp = model.invoke('Voce nao tem acesso a esse dados, informe o vendedor que nao possui esses dados, mas tente ajudar da melhor forma que der'+guardar_mensagem)
            print('resp:',resp.content)
            return_final =  resp
        elif out.tables:
            print('\n--- Próxima etapa: consultar essas tables ---\n')
            print(f"Tabelas a consultar: {out.tables}")
            # Exemplo: chamar a próxima etapa de busca real
            return_final =  chat_novai_manager_table_verification(out.tables, guardar_mensagem, user_id)
    try:

        chain = model.with_structured_output(Simplificador) | route
        chain.invoke(final_prompt_text)
        print("chegou aqui")
        print('return final:', return_final)
        #respostas = await model.abatch([{"messages": [{"role": "user", "content": json.dumps(p['dados retornados da query']),"function":'sintetize os dados em no max 10 linhas'}]} for p in return_final])
        prompt = ChatPromptTemplate.from_template(
    '''Você é um assistente de um vendedor do Mercado Livre. Uma outra IA buscou informações no banco de dados para responder à seguinte pergunta:

{mensagem}

Com base nos seguintes dados:
{mensagem_final}

📌 Responda de forma simples, clara e completa, como se estivesse explicando para um vendedor comum.

- Seja robusto e objetivo na resposta.
- Se os dados permitirem, **use Markdown** para deixar a visualização mais agradável (ex: listas, tabelas ou blocos de código com três crases).
- Exemplo de formatação recomendada:
  - **Negrito**
  - Listas numeradas ou com pontos
  - Quebras de linha (`\n`)
  - Tabelas com `| Coluna | Valor |`

Se não for possível usar Markdown, apenas responda normalmente.
'''
)
        chain= prompt | model | StrOutputParser()
        resposta_final=chain.invoke({'mensagem_final':return_final, 'mensagem':guardar_mensagem})
        print('resposta final:', resposta_final)
        return jsonify({'resposta_final':resposta_final})
    except Exception as e:
        print(f'Erro ao processar o modelo: {e}')





def chat_novai_manager_table_verification(tables : list,mensagem: str,user_id: int):

    model = ChatOpenAI(model='gpt-4o')

    descricao_table = {
    "campanhas": """Tabela: 'campanhas'
    Descrição: Representa campanhas de publicidade criadas pelo vendedor.
    Colunas:
    - 'campanha_id': BIGINT, PRIMARY KEY
    - 'nome': TEXT
    - 'status': TEXT (valores possíveis: active, paused, archived, scheduled, pending)
    - 'strategy': TEXT (valores possíveis: profitability, visibility, increase)
    - 'budget': NUMERIC(10,2)
    - 'currency_id': TEXT
    - 'last_updated': TIMESTAMP
    - 'date_created': TIMESTAMP
    - 'usuario_id_campanhas': INTEGER, FOREIGN KEY → usuarios(id)
    - 'channel': TEXT (marketplace, mshops)
    - 'acos_target': NUMERIC(10,2)
    Relacionamentos:
    - campanhas → campanhas_metricas_diarias (1:N)
    - campanhas → anuncios (1:N)
    """,

        "anuncios": """Tabela: 'anuncios'
    Descrição: Anúncios ativos ou pausados, relacionados a campanhas e itens.
    Colunas:
    - 'id_anuncio': TEXT, PRIMARY KEY
    - 'item_id': TEXT, FOREIGN KEY → itens(item_id)
    - 'title': TEXT,
    - 'price': NUMERIC(10,2),
    - 'campanha_id': INTEGER, FOREIGN KEY → campanhas(campanha_id)
    - 'status': TEXT (valores possíveis: active, paused, hold)
    - 'has_discount': BOOLEAN
    - 'catalog_listing': BOOLEAN
    - 'logistic_type': TEXT (default, fulfillment, drop_off, cross_docking, xd_drop_off)
    - 'listing_type_id': TEXT (gold_pro (explicação: categoria de maior visibilidade e destaque, possibilidades de upgrades(videos, destaques, etc)), gold_special(explicação: categoria classica, padrao mais simples), free(nao pago))
    - 'date_created': TIMESTAMP
    - 'buy_box_winner': BOOLEAN
    - 'channel': TEXT
    - 'condition': TEXT (new, used)
    - 'current_level': TEXT (unknown,geen , yellow, red, newbie)(reputação do anuncio)
    - 'recomended': BOOLEAN (se Mercado Livre recomenda esse item para publicidade neste momento)
    - 'image_quality': TEXT (high, medium, low)
    - 'usuario_id_anuncios': INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - anuncios → anuncios_metricas_diarias (1:N)
    """,

        "campanhas_metricas_diarias": """Tabela: 'campanhas_metricas_diarias'
    Descrição: Métricas de desempenho diário das campanhas.
    Colunas:
    - 'campanha_id': INTEGER, FOREIGN KEY → campanhas(campanha_id)
    - 'nome': TEXT
    - 'clicks': INTEGER
    - 'prints': INTEGER
    - 'cost': NUMERIC(10,2)
    - 'cpc': NUMERIC(6,2)
    - 'ctr': NUMERIC(10,2) → (clicks/prints)*100
    - 'direct_amount': NUMERIC(10,2)
    - 'indirect_amount': NUMERIC(10,2)
    - 'organic_amount': NUMERIC(10,2)
    - 'direct_units_quantity': INTEGER
    - 'indirect_units_quantity': INTEGER
    - 'organic_units_quantity': INTEGER
    - 'direct_items_quantity': INTEGER
    - 'indirect_items_quantity': INTEGER
    - 'organic_items_quantity': INTEGER
    - 'advertising_items_quantity': INTEGER -- (Total de anúncios ativos na campanha)
    - 'acos': NUMERIC(10,2)
    - 'cvr': NUMERIC(10,2)
    - 'roas': NUMERIC(10,2)
    - 'sov': NUMERIC(10,2)
    - 'impression_share': NUMERIC(10,2) -- (%, de impressões que seu anúncio obteve em relação ao total possível)
    - 'top_impression_share': NUMERIC(10,2) -- (%, de impressões no topo dos resultados)
    - 'lost_impression_share_by_budget': NUMERIC(10,2) -- (%, de impressões perdidas por orçamento insuficiente)
    - 'lost_impression_share_by_ad_rank': NUMERIC(10,2) -- (%, de impressões perdidas por ranking baixo (relevância/lance))
    - 'acos_benchmark': NUMERIC(10,2) -- (ACOS médio do mercado para comparação)
    - 'date': TIMESTAMP
    - 'usuario_id_campanhas_metricas_diarias': INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - campanhas_metricas_diarias → campanhas (N:1)
    """,

        "anuncios_metricas_diarias": """Tabela: 'anuncios_metricas_diarias'
    Descrição: Métricas de desempenho diário dos anúncios.
    Colunas:
    - 'id_anuncio': TEXT, FOREIGN KEY → anuncios(id_anuncio)
    - 'item_id': TEXT, FOREIGN KEY → itens(item_id)
    - 'title': TEXT
    - 'clicks': INTEGER
    - 'prints': INTEGER
    - 'cost': NUMERIC(10,2)
    - 'cpc': NUMERIC(10,2)
    - 'direct_amount': NUMERIC(10,2)
    - 'indirect_amount': NUMERIC(10,2)
    - 'organic_amount': NUMERIC(10,2)
    - 'direct_units_quantity': INTEGER
    - 'indirect_units_quantity': INTEGER
    - 'organic_units_quantity': INTEGER
    - 'direct_items_quantity': INTEGER
    - 'indirect_items_quantity': INTEGER
    - 'organic_items_quantity': INTEGER
    - 'advertising_items_quantity': INTEGER -- (Total de anúncios ativos na campanha)
    - 'acos': NUMERIC(10,2)
    - 'sov': NUMERIC(10,2)
    - 'ctr': NUMERIC(10,2)
    - 'cvr': NUMERIC(10,2)
    - 'roas': NUMERIC(10,2)
    - 'date': TIMESTAMP
    - 'usuario_id_anuncios_metricas_diarias': INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - anuncios_metricas_diarias → anuncios (N:1)
    """,

    'pedidos_resumo': """Tabela: 'pedidos_resumo'
    Descrição: Todos os pedidos feitos por clientes.
    Colunas:
    - 'id_order': TEXT, PRIMARY KEY
    - 'date_created': TIMESTAMP
    - 'date_closed': TIMESTAMP
    - 'date_approved': TIMESTAMP
    - 'last_updated': TIMESTAMP
    - 'status': TEXT (valores possíveis: approved, in_mediation, rejected, charged_back, refunded, cancelled)
    - 'total_amount': NUMERIC(10,2)
    - 'paid_amount': NUMERIC(10,2)
    - 'shipping_cost': NUMERIC(10,2)
    - 'payment_method': TEXT (valores possíveis: credit_card, debit_card, bank_transfer, boleto, cash_on_delivery)
    - 'payment_type': TEXT (valores possíveis: regular_payment, pre_authorized_payment, deferred_payment)
    - 'installments': INTEGER
    - 'installment_amount': NUMERIC(10,2)
    - 'item_id': TEXT, FOREIGN KEY → itens(item_id)
    - 'item_title': TEXT
    - 'item_condition': TEXT (new, used)
    - 'item_warranty': TEXT (valores possíveis: no_warranty, warranty, extended_warranty)
    - 'listing_type_id': TEXT (valores possíveis: gold_pro, gold_special, free)
    - 'category_name': TEXT
    - 'unit_price': NUMERIC(10,2)
    - 'sale_fee': BOOLEAN
    - 'quantity': INTEGER
    - 'buyer_id': TEXT, FOREIGN KEY → usuarios(id)
    - 'tags': TEXT[] (array de tags associadas ao pedido)
    - 'fullfiled': BOOLEAN (indica se o pedido foi totalmente entregue)
    - 'pack_id': TEXT, FOREIGN KEY → packs(pack_id)
    - 'usuario_id_pedidos_resumo': INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - pedidos_resumo → itens (N:1)
    - pedidos_resumo → packs (N:1)
    - pedidos_resumo → reclamacoes (1:1) através de packs
    """,
        "itens": """Tabela: 'itens'
    Descrição: Catálogo de produtos cadastrados pelo vendedor.
    Colunas:
    - 'usuario_id_item': INTEGER, FOREIGN KEY → usuarios(id)
    - 'item_id': TEXT, PRIMARY KEY
    - 'nome_item': TEXT
    - 'quantidade': INTEGER
    - 'preco': NUMERIC(9,2)
    - 'descricao': TEXT
    - 'imagem': TEXT[] (array de URLs)
    - 'preco_original': NUMERIC(9,2)
    - 'preco_base': NUMERIC(9,2)
    - 'disponivel': BOOLEAN
    - 'tipo_ad': TEXT
    - 'categoria': TEXT
    Relacionamentos:
    - itens → anuncios (1:N)
    - itens → pedidos_resumo (1:N)
    - itens → anuncios_metricas_diarias (1:N)
    - itens → mensagens_clientes (1:N)
    """,
    "reputacao_vendedor": '''Tabela: "reputacao_vendedor"
    Descrição: Armazena informações sobre a reputação do vendedor.
    Colunas:
    - "level_id": TEXT
    - "power_seller_status": TEXT 
    - "period": TEXT(EX: historic)
    - "total_transactions": INTEGER
    - "completed_transactions": INTEGER
    - "canceled_transactions": INTEGER
    - "positive_reviews": NUMERIC(3,2)
    - "neutral_reviews": NUMERIC(3,2)
    - "negative_reviews": NUMERIC(3,2)
    - "tags" : TEXT[]
    - "seller_experience": TEXT 
    - "usuario_id_reputacao_vendedor": INTEGER, FOREIGN KEY → usuarios(id)
    - "consumed_credit": NUMERIC(10,2)
    - "credit_level_id": TEXT
    - "user_type": TEXT
    ''',
    "dados_vendedor": '''Tabela: "dados_vendedor"
    Descrição: Armazena informações gerais e sensiveis do vendedor
    Colunas:
    - "id_ml": BIGINT
    - "first_name": TEXT
    - "last_name": TEXT
    - "email": TEXT
    - "identification_type": TEXT
    - "identification_number": BIGINT
    - "state": TEXT
    - "city": TEXT
    - "address": TEXT
    - "zip_code": BIGINT
    - "phone_number": BIGINT
    - "verified": BOOLEAN
    - "usuario_id_dados_vendedor": INTEGER, FOREIGN KEY → usuarios(id)
    - "nickname": TEXT
    - "registration_date": TIMESTAMP
    - "site_id": TEXT
    - "permalink": TEXT
    - "shipping_mode": TEXT[]
    - "logo": TEXT (URL da imagem)
    ''',
    "packs": '''Tabela: "packs"
    Descrição: Armazena pack_id para relacionar mensagens com pedidos.
    Colunas:
    - "pack_id": TEXT, PRIMARY KEY
    - "usuario_id_packs": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - packs → mensagens_clientes (1:N)
    - packs → pedidos_resumo (1:N)
    ''',
    "messages": '''Tabela: "messages"
    Descrição: Armazena mensagens trocadas entre o vendedor e o cliente.
    Colunas:
    - "pack_id": TEXT, FOREIGN KEY → packs(pack_id), obs: (apenas para type = 'post_sale')
    - "client_name": TEXT
    - "message": TEXT
    - "date_created": TIMESTAMP
    - "author": TEXT (seller, buyer,AI)
    - "type": TEXT (post_sale, pre_sale)
    - "read": BOOLEAN
    - "is_first_message": TEXT, obs:(apenas para type = 'post_sale')
    - "item_id": TEXT, FOREIGN KEY → itens(item_id), obs:(apenas para type = 'pre_sale')
    - "status": TEXT (answered,active,etc), obs:(apenas para type = 'pre_sale')
    - "usuario_id_messages": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - messages → packs (N:1)
    - messages → itens (N:1)
    ''',
    "promotion": '''Tabela: "promotion"
    Descrição: Armazena informações sobre promoções ativas ou pendentes ou candidatas do vendedor.
    Colunas:
    - "id_promotion": TEXT, PRIMARY KEY
    - "name": TEXT
    - "status": TEXT (active, pending, candidate)
    - "start_date": TIMESTAMP
    - "finish_date": TIMESTAMP
    - "deadline_date": TIMESTAMP
    - "type_promotion": TEXT
    - "usuario_id_promotion": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - promotion → ponte_item_promotions (1:N)
    ''',
    "marketplace_campaign_type_promotion": '''Tabela: "marketplace_campaign_type_promotion"
    Descrição: Armazena informações de promoções do tipo "marketplace_campaign_type_promotion".
    Colunas:
    - "id_promotion": TEXT, PRIMARY KEY, FOREIGN KEY → promotion(id_promotion)
    - "type_promotioin": TEXT
    - "type_benefits": TEXT
    - "meli_percentage": NUMERIC(10,2)
    - "seller_percentage": NUMERIC(10,2)
    - "usuario_id_marketplace_campaign_type_promotion": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - marketplace_campaign_type_promotion → promotion (N:1)
    ''',
    "pre_negotiated_type_promotion_offers": '''Tabela: "pre_negotiated_type_promotion_offers"
    Descrição: Armazena informações de promoções do tipo "pre_negotiated_type_promotion_offers".
    Colunas:
    - "id_promotion": TEXT, PRIMARY KEY, FOREIGN KEY → promotion(id_promotion)
    - "type_promotion": TEXT
    - "offer_id": TEXT
    - "type_benefits": TEXT
    - "meli_percent": NUMERIC(10,2)
    - "seller_percent": NUMERIC(10,2)
    - "start_date": TIMESTAMP
    - "end_date": TIMESTAMP
    - "status": TEXT 
    - "original_price": NUMERIC(10,2)
    - "new_price": NUMERIC(10,2)
    - "usuario_id_pre_negotiated_type_promotion_offers": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - pre_negotiated_type_promotion_offers → promotion (N:1)
    ''',
    "seller_coupon_campaign_type_promotion": '''Tabela: "seller_coupon_campaign_type_promotion"
    Descrição: Armazena informações de promoções do tipo "seller_coupon_campaign_type_promotion".
    Colunas:
    - "id_promotion": TEXT, PRIMARY KEY, FOREIGN KEY → promotion(id_promotion)
    - "type_promotion": TEXT
    - "sub_type": TEXT
    - "fixed_amount": NUMERIC(10,2)
    - "fixed_percentage": NUMERIC(10,2)
    - "min_purchase_amount": INTEGER 
    - "max_purchase_amount": INTEGER
    - "redeems_per_user": INTEGER
    - "budget": NUMERIC(10,2)
    - "remaining_budget": NUMERIC(10,2)
    - "coupon_code": TEXT
    - "used_coupons": INTEGER
    - "usuario_id_seller_coupon_campaign_type_promotion": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - seller_coupon_campaign_type_promotion → promotion (N:1)
    ''',
    "volume_type_promotion": '''Tabela: "volume_type_promotion"
    Descrição: Armazena informações de promoções do tipo "volume_type_promotion".
    Colunas:
    - "id_promotion": TEXT, PRIMARY KEY, FOREIGN KEY → promotion(id_promotion)
    - "buy_quantity": INTEGER
    - "pay_quantity": INTEGER
    - "allow_combination": BOOLEAN
    - "sub_type": TEXT
    - "type_promotion": TEXT
    - "usuario_id_volume_type_promotion": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - volume_type_promotion → promotion (N:1)
    ''',
      "ponte_item_promotions": '''Tabela: "ponte_item_promotions"
    Descrição: Armazena informações sobre itens que estão em promoções, servindo como uma ponte entre a tabela de promoções e itens.
    Colunas:
    - "id_promotion": TEXT, FOREIGN KEY → promotion(id)
    - "item_id": TEXT, FOREIGN KEY → itens(item_id)
    - "status": TEXT (active, pending, candidate)
    - "price": NUMERIC(10,2)
    - "original_price": NUMERIC(10,2)
    - "min_discounted_price": NUMERIC(10,2)
    - "max_discounted_price": NUMERIC(10,2)
    - "suggested_discounted_price": NUMERIC(10,2)
    - "start_date": TIMESTAMP
    - "end_date": TIMESTAMP
    - "sub_type": TEXT
    - "offer_id": TEXT
    - "meli_percentage": NUMERIC(10,2)
    - "seller_percentage": NUMERIC(10,2)
    - "buy_quantity": INTEGER
    - "pay_quantity": INTEGER
    - "allow_combination": BOOLEAN
    - "fixed_amount": NUMERIC(10,2)
    - "fixed_percentage": NUMERIC(10,2)
    - "top_deal_price": NUMERIC(10,2)
    - "discount_percentage": NUMERIC(10,2)
    - "usuario_id_ponte_item_promotions": INTEGER, FOREIGN KEY → usuarios(id)
    Relacionamentos:
    - ponte_item_promotions → promotion (N:1)
    - ponte_item_promotions → itens (N:1)
    ''',
    'reclamacoes': '''Tabela: "reclamacoes"
    Descrição: Armazena informações sobre reclamações feitas pelos clientes.
    Colunas:
    - "claim_id": BIGINT, PRIMARY KEY
    - "resource_id": BIGINT
    - "status": TEXT (unicos valores: open, closed)
    - "tipo": TEXT
    - "stage": TEXT
    - "parent_id": BIGINT
    - "pack_id": TEXT
    - "reason_id": TEXT
    - "fulfilled": BOOLEAN
    - "quantity_type": TEXT
    - "site_id": TEXT
    - "date_created": TIMESTAMP (apenas a data em que a reclamação foi feita)
    - "last_updated": TIMESTAMP
    - "comprador_id": BIGINT
    - "acoes_disponiveis": TEXT[]
    - "name_reason": TEXT
    - "expected_solutions": TEXT[]
    - "problem": TEXT
    - "description": TEXT
    - "due_date": TIMESTAMP
    - "title": TEXT
    - "action_responsible": TEXT
    - "reason_resolution": TEXT
    - "date_resolution": TIMESTAMP
    - "benefited": TEXT[]
    - "resolution_closed_by": TEXT
    - "apllied_coverage": BOOLEAN
    - "usuario_id_reclamacoes": INTEGER, FOREIGN KEY → usuarios(id)
    - "pack_id": TEXT, FOREIGN KEY → packs(pack_id)
    Relacionamentos:
    - reclamacoes → usuarios (N:1)
    - reclamacoes → packs (N:1)
    - reclamacoes → pedidos_resumo (1:1) (através de packs)
    ''',
}


    prompt = ChatPromptTemplate.from_template("""
    Você é um assistente especializado em PostgreSQL. Dada a descrição das tabelas abaixo e uma pergunta em linguagem natural, gere uma ou no maximo 5 queries SQL puras separadas por vírgula que busquem todos os dados necessários para que uma segunda IA possa realizar os cálculos e raciocínios necessários para responder.

    🧠 Regras obrigatórias:
    - NÃO responda a pergunta diretamente.
    - As queries devem funcionar em postgreSQL no python então se atente na sintaxe.
    - Sua única tarefa é gerar as SQLs que trazem os dados brutos da pergunta.
    - A resposta deve conter apenas SQLs puras, sem comentários, sem explicações e sem uso de blocos de código (como ``` ou markdown).
    - As queries devem ser válidas e executáveis no PostgreSQL.
    - Sempre use os nomes exatos das colunas e tabelas conforme fornecido na descrição.
    - Toda query deve conter o filtro de usuário adequado, por exemplo:
    - WHERE usuario_id_item = {user_id}
    - WHERE usuario_id_mensagem = {user_id}
    -⚠️ Muito importante: Nao crie queries que retornem muitas linhas, seja objetivo e sintetize os dados, sendo mais direto possível nas querys.
    - Tome máximo cuidado para evitar divisões por zero, especialmente em métricas como CTR, CVR, ROAS, etc.
    - Prefira sempre usar prefixo com o nome da tabela nas colunas, para evitar ambiguidade, como: a.item_id, m.data_envio.
    - Se a pergunta não especificar uma data, pegue os dados de no maximo 90 dias atras

   📊 REFORÇO IMPORTANTE – Busque DADOS EXTRAS de forma estratégica e contida:
    -Além das queries mínimas para responder à pergunta principal, inclua queries complementares que ajudem a segunda IA a criar uma resposta mais completa, contextualizada, visual e explicativa.
    -Mas atenção: essas queries complementares não devem ser pesadas ou exageradas. Evite consultas que retornem muitas linhas ou dados brutos demais – prefira queries simples, agregadas e mais analíticas.
    -⚠️ Muito importante: Sempre que possivel agrupe e some dados para diminuir a quantidade de linhas retornadas.
    -⚠️ Muito importante: Nao crie queries que retornem muitas linhas, seja objetivo e sintetize os dados, sendo mais direto possível nas querys.
    -O foco é enriquecer a análise, não sobrecarregar com volume de dados.
    -Se possivel mande ate 3 querys, mas no maximo 5 querys.
    -A primeira query deve ser a mais importante e direta para responder a pergunta principal as demais sao apenas para um enriquecimento na resposta.
    -⚠️ Muito importante: As querys de enriquecimento devem ser limitadas por ate no maximo do maximo até 1000 linhas de retorno (LIMIT 1000),                                    
    -⚠️ Muito importante: Sempre use os nomes exatos das colunas e tabelas conforme fornecido na descrição.
                                              
    ⚠️ Contexto:
    - Data de hoje = {data_atual}

    Sempre use aliases e alias claros quando possível.

    Retorne múltiplas queries separadas em uma lista de strings em python para compor a resposta completa.

    Exemplo de entrada:
    Pergunta: quanto eu faturei tirando o product ads?

    Resposta:
    SELECT SUM(organic_units_amount) FROM anuncios_metricas_diarias WHERE usuario_id_anuncios_metricas_diarias = {user_id} AND date >= CURRENT_DATE - INTERVAL '90 days',
    SELECT date, SUM(organic_units_amount) FROM anuncios_metricas_diarias WHERE usuario_id_anuncios_metricas_diarias = {user_id} AND date >= CURRENT_DATE - INTERVAL '90 days' GROUP BY date ORDER BY date,
    SELECT SUM(direct_amount + indirect_amount) FROM anuncios_metricas_diarias WHERE usuario_id_anuncios_metricas_diarias = {user_id} AND date >= CURRENT_DATE - INTERVAL '90 days'


    Agora responda à pergunta:
    {mensagem}
    Descrição das tabelas:
    {descricao_table}



    """)
    descricao_tables=''
    for table in tables:
        descricao_tables+=f'{descricao_table.get(table)}\n'

    class Queries(BaseModel):
        lista: list[str] = Field(description='separe uma ou mais querys q estarão separadas por "," ou ";" ,tire os \n e "," no final e coisas que possam dar erro de sintaxe na query ,e retorne uma lista com elas para serem executadas')
    dados = None
    count = 0
    def route(output: Queries):
        print('output lista: ', output.lista)
        nonlocal dados
        nonlocal count
        conn=get_db_connection()
        cur=conn.cursor()

        dados = []
        for respost in output.lista:
            try:
                cur.execute(respost)
                dados_resposta=cur.fetchall()
                dado = {
                    'query': respost,
                    'dados retornados da query': dados_resposta
                }
                dados.append(dado)
            except Exception as e:
                print(f"Erro ao executar a query {respost}: {e}")       

    chain = prompt | model.with_structured_output(Queries) | route
    chain.invoke({'data_atual':datetime.now(),'descricao_table':descricao_tables,'user_id':user_id,'mensagem':mensagem})
    print('dados retornados')
    print('\n'*8)

    return dados


# 🚀 Rodar o servidor
if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)



















