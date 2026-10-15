# Precify v2: accounts, plans and billing

This additive release preserves NOVAI accounts, Mercado Livre OAuth and the existing extension APIs.
`init_db.py` applies `database/precify_v2.sql` during deployment. It does not drop or replace existing tables.

## Plans

| Plan | Monthly | Annual | Searches | Features |
|---|---:|---:|---|---|
| Free | R$ 0 | R$ 0 | 10/month | Main calculator, shipping/fees/tax, local history |
| Plus | R$ 31.90 | R$ 279.90 | Unlimited | Comparisons, including Classic/Premium |
| Pro | R$ 34.90 | R$ 299.90 | Unlimited | Plus + listing insights when available |

A Pro trial lasts seven days, once per NOVAI account, without automatic billing. Paid checkout is a separate, explicit action. The annual option charges the annual total, not twelve monthly instalments. Cancellation stops renewal; verified paid access lasts until the recorded end of its period. Refunds and chargebacks remove the associated paid entitlement.

The allowance resets on the first day of each calendar month in America/Sao_Paulo. Each authorized import attempt consumes one search; retries with the same request key and exact URL are idempotent. An account row lock enforces this across concurrent devices. Successful imports can be retried for 30 minutes using their account- and URL-bound permit. App storage cannot reset the allowance.

## App API

All authenticated routes require `X-Precify-Session` with the opaque NOVAI device session. Sessions expire after 90 days and can be revoked by logging out. Only a SHA-256 digest is stored in the database. The mobile app stores this opaque token in Expo SecureStore; the web relay uses an HttpOnly cookie. Mercado Livre tokens remain in NOVAI and are refreshed server-side.

- `POST /api/precify/auth/register`: name, email, password, acceptedTerms=true, termsVersion=2026-10-15. Creates a regular NOVAI account and records acceptance.
- `POST /api/precify/auth/login`: email/password. Returns user, linked, plan and sessionToken. No Mercado Livre credentials.
- `GET /api/precify/session`: current user, linking state and effective server-owned plan.
- `POST /api/precify/auth/logout`: revoke current device session.
- `POST /api/precify/auth/connect`: creates a short-lived, one-use OAuth ticket. Open returned URL in the app browser.
- `GET /auth/precify/connect?ticket=...`: consumes ticket, redirects to official ML authorization using PKCE/state.
- `GET /callback`: existing callback handles the `precify_` state separately and binds credentials to that NOVAI account. No credentials in redirects.
- `GET /api/precify/terms`: versioned onboarding agreement. Replace with reviewed business terms before commercial launch if necessary; changing its version also requires updating the app acceptance version.
- `POST /api/precify/imports`: url and UUID requestKey. Returns importId and updated plan, or 429 monthly_limit.
- `POST /api/precify/imports/validate`: url/importId. Returns allowed insights after checking ownership, exact URL and validity.
- `GET /api/precify/items/{MLB_ID}/insights`: Pro only; checks entitlement BEFORE any ML token lookup or upstream request. Uses `/items/{id}` and, for a missing date, `/items/{id}/description`. The latter is the description date and does not guarantee listing creation; `source` preserves that distinction.
- `POST /api/precify/pricing`: calculator inputs; uses the existing official ML pricing handler with the logged-in seller's server-side token. `comparison: true` also requires Plus/Pro.
- `POST /api/precify/comparison`: Plus/Pro. For Shopee/Amazon, uses the explicit commission, fixed fee and shipping supplied by the user. Never treats the HTML prototype's sample rates as verified marketplace prices.
- `POST /api/precify/trial`: one-time seven-day Pro trial.
- `GET /api/precify/billing/plans`: public catalog and paymentsEnabled.
- `POST /api/precify/billing/checkout`: tier (plus/pro), cycle (monthly/annual). Amount/currency/recurrence come exclusively from server configuration.
- `GET /api/precify/billing/history`: own subscriptions and payment records.
- `POST /api/precify/billing/cancel`: subscriptionId owned by the account.

Free and Plus app imports do not extract or request Pro dates/sales. Locked cards contain fixed, fictional values, not concealed actual data. Local history strips protected metrics even when imported during Pro. Official API failures remain missing values, never fabricated estimates.

## Mercado Pago configuration

Required Railway NOVAI variables (never commit their values):

- `MERCADO_PAGO_ACCESS_TOKEN`: Mercado Pago server-side credential for the collector account. This is NOT a Mercado Livre token.
- `MERCADO_PAGO_WEBHOOK_SECRET`: signature secret for the integration's Webhooks.
- Optional `MERCADO_PAGO_COLLECTOR_ID`: additionally pins the payment receiver.
- Existing `DATABASE_URL`, `PUBLIC_BASE_URL`, `MERCADO_LIVRE_CLIENT_ID`, `MERCADO_LIVRE_CLIENT_SECRET`, `MERCADO_LIVRE_REDIRECT_URI` remain required.

Register this Webhook in Mercado Pago integrations:

`https://novai-production-0d2f.up.railway.app/api/precify/billing/webhook`

Enable payment and subscription notifications (`payment`, `subscription_preapproval`, `subscription_authorized_payment`). The return URL is `/api/precify/billing/return`. The redirect does not grant access.

Webhook processing verifies x-signature, x-request-id, resource ID and timestamp (10-minute tolerance), then independently retrieves the resource using the server credential. It verifies subscription reference, amount and currency, and records provider timestamps/idempotent payment IDs. Only approved payment records grant paid access. Replayed or older events cannot extend a period or replace a newer refund state. Subscription authorization alone is insufficient. Events, subscriptions, payments, billing dates, trial dates and consents have separate records; raw payment/card payloads are not stored.

Without the two Mercado Pago credentials, checkout returns payments_not_configured and the app shows “Pagamento em preparação”. Free use and the seven-day trial remain available. Real checkout/webhook verification must be exercised with Mercado Pago test accounts and the configured integration before accepting customer payments; local tests mock the provider and do not charge anyone.

## Validation

Existing tests: `python -m pytest flask-backend/tests`.

PostgreSQL integration tests additionally require an explicitly isolated `PRECIFY_TEST_DATABASE_URL`. The suite creates a random schema and removes it after each test; it never falls back to production DATABASE_URL. Coverage includes migrations, NOVAI signup/login, session revocation, one-use OAuth/PKCE, concurrent quota, Brasilia month boundaries, protected data denial before ML calls, trial expiry, server-owned prices, signed Webhooks, duplicate payments, refunds and ownership checks.

The Expo project runs typecheck, lint, Node tests and Android/iOS/web exports. No production account or payment is created by these tests.
