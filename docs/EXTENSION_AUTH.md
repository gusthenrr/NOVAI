# Browser extension authentication (2026-10-18)

New routes under `/api/extension`, separate from legacy extension and Precify. `init_db.py` applies `database/extension_sessions.sql` at startup. Requires the existing JWT secret, database and Mercado Livre OAuth environment variables. The existing registered `/callback` dispatches `ext_` states to this flow; no new ML callback registration is needed.

## Client and privacy boundary

The unpacked extension has stable ID `pfanhenbfblcbfldhpelnlmbheokjdlj`, derived from the public `key` in its manifest. No private key is stored. Allowed origins are this exact extension and PUBLIC_BASE_URL; additional explicit origins can be configured in NOVAI_EXTENSION_ORIGINS (comma separated). Never use `*` or arbitrary extension origins. Production PUBLIC_BASE_URL must match the HTTPS Railway origin used by the extension.

Cookies `__Host-novai-ext-access` (JWT, 15 minutes), `__Host-novai-ext-refresh` (rotating credential, 7 days inactivity) and `__Host-novai-ext-csrf` are Secure, HttpOnly, SameSite=None, path `/`, without Domain. The service worker sends cookies with credentials:include. No auth credentials are returned to page scripts or extension storage. Account/login page is hosted on NOVAI, has nonce CSP, no third-party scripts and cannot be framed. `/csrf` permits only allowed Origin or same-origin browser requests. POSTs require an allowed Origin and a matching CSRF header/cookie. Cookie restrictions imposed by the browser may require user troubleshooting; do not bypass them silently.

`POST /session` checks but does not extend inactivity. `/activity` extends on user interaction, at most once per five minutes per session. Inactive expiry cannot be resurrected. Refresh rotation is locked in PostgreSQL; parallel requests within 30 seconds receive the same current credential. Replay of a known used credential outside this grace revokes the session. Hashes, not plaintext refresh credentials, are stored. Every protected action validates JWT issuer/audience/signature and DB revocation/auth_version. Logout and password changes revoke access. Access and renewal credentials are isolated from legacy JWTs.

Observed ML IDs (root/collaborator, Melidata, buyerId, preloaded, New Relic) are hints only, up to five numeric strings per tab. No email scraping. Backend derives NOVAI identity from authenticated session and looks up contas_mercado_livre by usuario_id, never by an arbitrary caller-supplied seller ID. Mismatch returns only match/mismatch/unknown to the authenticated caller; it does not change linkage or select another person's credentials. No public account-existence lookup. A local boolean records prior usage to label the login button without identifying anyone.

## Routes

GET `/account`: login, registration, agreement, account update and reconnect UI.
GET `/csrf`: non-auth credential for protected POSTs.
POST `/login`, `/register`, `/complete`: existing NOVAI users/password policy and agreement.
POST `/session`, `/activity`, `/logout`: browser session lifecycle.
POST `/connect`: starts explicit OAuth with PKCE and state tied to session; callback consumes state once and revalidates session before saving connection. It only redirects to the fixed NOVAI account page.
POST `/connection`: validates/refreshes this user's ML credentials using existing server-side ml_token; returns readiness only. Future data routes must use identity(), require_ready() and ml_token(session.user_id), and enforce resource/plan permissions.

Denied access returns identical JSON `{"error":"not_found"}` with HTTP 404, internal sanitized event status=403 and request ID. Operational/input failures retain separate statuses. Do not log credentials, email, request/response bodies or OAuth query strings. Gunicorn access logging now excludes query parameters.

## Verification

Run all Flask tests through the existing isolated embedded PostgreSQL harness. New tests cover cookie flags, CSRF/origins, generic denial, inactivity, rotation/concurrency/replay, expiry, logout, auth_version, forged JWT, account mismatch, account update, and single-use browser-bound OAuth. No production accounts are created by tests.

Rollback: revert registration of the blueprint/dispatcher and extension changes. Additive tables can remain; no existing app schema/credentials are removed. The frontend can be disabled/reloaded independently. Signing secret changes invalidate extension sessions.

## Data de criação no badge

`POST /api/extension/items/created-at` exige a mesma sessão em cookies, CSRF, origem permitida, conta pronta e limite de 60 consultas por janela de rate limit. Corpo: `{"item_id":"MLB6203834422"}`. IDs de usuário, vendedor e tokens recebidos no corpo nunca selecionam as credenciais: a conta vem exclusivamente da sessão validada.

A extensão só chama este recurso quando não encontra `startTime` no HTML/runtime da oferta selecionada. O servidor usa `ml_token(user_id)` (inclusive renovação e persistência do refresh token), consulta `/items/{id}?attributes=id,date_created` e, sem data válida, `/items/{id}/description`. Esse é o mesmo encadeamento do Precify insights. O recurso não busca vendas nem descrição textual para entregar ao cliente.

Resposta: `{"itemId":"MLB6203834422","createdAt":{"iso":"2026-01-27T23:33:16.887Z","source":"ml_item"}}`, ou origem `ml_description`, ou `createdAt:null` se ausente. Datas de edição nunca são utilizadas. A origem `ml_description` identifica a criação da descrição, que pode ser posterior à criação do anúncio. A extensão informa isso no tooltip e conserva a origem no estado do badge.

Negação de permissão retorna somente `404 {"error":"not_found"}` e registra `status=403` no servidor. Registros de diagnóstico contêm apenas o status HTTP e o identificador da requisição, nunca o corpo upstream ou tokens. Timeout/indisponibilidade retorna 502; limite upstream retorna 429. Falhas não devem ser interpretadas como uma data nem invalidar a sessão local por si só.
