import subprocess
import requests
import time
import json
import os

# 🔥 Configurações
ML_APP_ID = "3414621845496970"  # Seu App ID do Mercado Livre
ML_ACCESS_TOKEN = "SEU_ACCESS_TOKEN"  # 🔥 Troque por um access token válido
NEXT_ENV_FILE = "./.env.local"  # Caminho do arquivo de ambiente do Next.js

# 🛠️ 1️⃣ Inicia o ngrok e obtém a nova URL
print("🔄 Iniciando ngrok...")
ngrok_process = subprocess.Popen(["ngrok", "http", "5000"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(5)  # Espera o ngrok iniciar

# Obtém a URL pública gerada pelo ngrok
try:
    tunnels = requests.get("http://127.0.0.1:4040/api/tunnels").json()
    ngrok_url = tunnels["tunnels"][0]["public_url"]
    print(f"✅ ngrok iniciado com URL: {ngrok_url}")
except Exception as e:
    print("❌ Erro ao obter a URL do ngrok:", e)
    exit(1)

# 🛠️ 2️⃣ Atualiza a URL no Mercado Livre
print("🔄 Atualizando URL de redirecionamento no Mercado Livre...")
ml_url = f"https://api.mercadolibre.com/applications/{ML_APP_ID}/authorization/redirect_urls"

headers = {"Authorization": f"Bearer {ML_ACCESS_TOKEN}", "Content-Type": "application/json"}
payload = {"redirect_urls": [f"{ngrok_url}/callback"]}

response = requests.put(ml_url, headers=headers, data=json.dumps(payload))

if response.status_code == 200:
    print("✅ URL do Mercado Livre atualizada com sucesso!")
else:
    print("❌ Erro ao atualizar URL no Mercado Livre:", response.json())

# 🛠️ 3️⃣ Atualiza a URL no `.env.local` do Next.js
print("🔄 Atualizando .env.local do Next.js...")

env_content = f"""
NEXT_PUBLIC_API_URL={ngrok_url}
"""

with open(NEXT_ENV_FILE, "w") as env_file:
    env_file.write(env_content)

print("✅ .env.local atualizado!")

print("\n🚀 Tudo pronto! Agora inicie o Next.js com `npm run dev` e acesse:", ngrok_url)

