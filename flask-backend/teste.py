from flask import Flask, session,redirect
from flask_session import Session

app = Flask(__name__)

# Sua chave secreta (mantenha-a realmente secreta em produção!)
app.secret_key = 'sua_chave_secreta_aleatoria_aqui'

# Configurações da sessão
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_USE_SIGNER'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'

Session(app)

@app.route('/login')
def login():
    # Aqui você define os valores na sessão
    session['user_id'] = '123456'
    session['role'] = 'admin'  # Adicionando mais dados à sessão
    auth=f"https://a1b8-2804-7f0-7980-1e38-60f8-4a37-1a6b-5368.ngrok-free.app/get-session"
    response = redirect(auth)
    return response

@app.route('/get-session')
def get_session():
    # Acessando os dados armazenados na sessão
    user_id = session.get('user_id', 'Usuário não encontrado')
    user_role = session.get('role', 'Role não definido')
    return f'ID do Usuário: {user_id}, Role: {user_role}'

if __name__ == '__main__':
    app.run(debug=True, port=8080)
