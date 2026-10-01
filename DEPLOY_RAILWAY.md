# Deploy do backend NOVAI no Railway

O backend Flask fica em `flask-backend/teste.py`. O deploy usa o `Dockerfile`
da raiz, Gunicorn com Eventlet e uma única réplica/worker para manter o
Socket.IO e o agendador consistentes.

## 1. Segurança antes do deploy

Credenciais antigas ficaram registradas no histórico público do GitHub. Antes
de publicar novamente:

1. Troque o Client Secret do aplicativo no Mercado Livre Developers.
2. Revogue e gere novamente qualquer chave OpenAI usada pelo projeto.
3. Não reutilize a senha antiga do PostgreSQL.
4. Gere dois segredos diferentes:

   ```bash
   openssl rand -hex 32
   openssl rand -hex 32
   ```

   Use um resultado em `FLASK_SECRET_KEY` e o outro em `JWT_SECRET_KEY`.

## 2. Criar o PostgreSQL no Railway

No mesmo projeto, clique em **New > Database > PostgreSQL**. Para o modo atual,
que guarda somente credenciais OAuth, o backend aplica automaticamente o
esquema mínimo a cada inicialização, antes do Gunicorn.

Se preferir executar manualmente pela CLI, use:

```bash
railway link
railway connect Postgres < database/init_token_only.sql
```

O script cria somente `usuarios`, `verifier` e `contas_mercado_livre`. Ele não
cria nem popula tabelas de anúncios, pedidos, mensagens, campanhas ou métricas.

## 3. Enviar estas mudanças ao GitHub

Revise as alterações e envie-as para uma branch. Não inclua `.env` nem valores
secretos. O arquivo `.env.example` contém apenas os nomes e formatos esperados.

## 4. Criar o serviço no Railway

1. No Railway, crie um projeto.
2. Escolha **Deploy from GitHub repo**.
3. Selecione o repositório `gusthenrr/NOVAI` e a branch com estas mudanças.
4. O Railway detectará automaticamente o `Dockerfile` da raiz.
5. Em **Settings > Networking**, gere um domínio público.

O `railway.json` já configura `/health` como health check. O processo escuta a
variável `PORT` fornecida automaticamente pelo Railway.

## 5. Configurar variáveis no Railway

Na aba **Variables** do serviço, adicione:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_BASE_URL=https://SEU-SERVICO.up.railway.app
FRONTEND_URL=https://SEU-FRONTEND.up.railway.app
ALLOWED_ORIGINS=https://URL-DO-SEU-FRONTEND
FLASK_SECRET_KEY=VALOR-ALEATORIO-1
JWT_SECRET_KEY=VALOR-ALEATORIO-2
MERCADO_LIVRE_CLIENT_ID=NOVO-CLIENT-ID
MERCADO_LIVRE_CLIENT_SECRET=NOVO-CLIENT-SECRET
MERCADO_LIVRE_REDIRECT_URI=https://SEU-SERVICO.up.railway.app/callback
OPENAI_API_KEY=NOVA-CHAVE-OPENAI
ENABLE_SCHEDULER=false
ENABLE_INITIAL_SYNC=false
```

`ALLOWED_ORIGINS` aceita várias URLs separadas por vírgula. Não crie a variável
`PORT`; o Railway fornece esse valor.

Deixe `ENABLE_SCHEDULER=false` até o banco e as tabelas estarem prontos. Para
ativá-lo depois, mantenha somente uma réplica do serviço.

## 6. Ajustar o aplicativo do Mercado Livre

No painel do aplicativo Mercado Livre, cadastre exatamente esta Redirect URI:

```text
https://SEU-SERVICO.up.railway.app/callback
```

Ela deve ser idêntica ao valor de `MERCADO_LIVRE_REDIRECT_URI`.

## 7. Publicar e testar

Depois de salvar as variáveis, faça um novo deploy. Nos logs, confirme que o
Gunicorn iniciou com um worker Eventlet. Teste:

```bash
curl -i https://SEU-SERVICO.up.railway.app/health
```

Resposta esperada:

```json
{"status":"ok"}
```

Em seguida, teste cadastro, autorização do Mercado Livre e login. Com
`ENABLE_INITIAL_SYNC=false`, o callback salva apenas `access_token`,
`refresh_token`, `expiracao_token` e o `user_id` retornado pelo OAuth.

## 8. Domínio personalizado

Quando o domínio estiver novamente registrado e com DNS ativo, adicione-o em
**Railway > Settings > Networking > Custom Domain** e publique os registros
`CNAME` e `TXT` informados pelo Railway. Depois atualize `PUBLIC_BASE_URL`,
`MERCADO_LIVRE_REDIRECT_URI` e o domínio autorizado no Mercado Livre.

## 9. Publicar o frontend Next.js

Crie um segundo serviço no mesmo projeto Railway usando o mesmo repositório e
a mesma branch do backend.

No serviço do frontend:

1. Em **Settings > Source**, selecione o repositório `gusthenrr/NOVAI`.
2. Selecione a branch preparada para deploy.
3. Configure **Root Directory** como `/next.js`.
4. O Railway usará `next.js/Dockerfile` e `next.js/railway.json`.
5. Em **Variables**, adicione a URL pública do backend:

   ```text
   NEXT_PUBLIC_API_URL=https://SEU-BACKEND.up.railway.app
   ```

6. Gere um domínio público para o frontend em **Settings > Networking**.
7. No serviço do backend, atualize `ALLOWED_ORIGINS` com o domínio do frontend:

   ```text
   ALLOWED_ORIGINS=https://SEU-FRONTEND.up.railway.app
   ```

8. Faça redeploy dos dois serviços depois de salvar as variáveis.

`NEXT_PUBLIC_API_URL` é incorporada ao JavaScript durante o build do Next.js.
Sempre faça um novo deploy do frontend quando essa URL mudar.

## Comando de execução usado pela imagem

```text
gunicorn --worker-class eventlet --workers 1 --bind 0.0.0.0:$PORT --timeout 120 teste:app
```
