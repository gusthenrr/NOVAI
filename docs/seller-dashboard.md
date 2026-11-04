# Seller dashboard

`/dashboard/inicio` now serves the full 03-painel structure, replacing the old four-card component. The reference package remains unchanged. All production metrics come from `/api/novai/dashboard` with the existing NOVAI bearer JWT (expiration and auth_version validation). No sample model, sample costs, sample expenses, or sample sales are loaded.

## Collection and persistence

Opening the dashboard enqueues a profile task and returns 202 immediately. PostgreSQL `seller_jobs` persists checkpoints and leases per account and seller. A bounded background worker imports the newest month first, five enriched orders per slice, and increments a snapshot revision when a month finishes. The page polls status every 10 seconds and re-fetches the selected period on revision changes. Requests to change period do not wait for the collector. A restart resumes the checkpoint; upserts prevent duplicate orders. Dense order searches split into smaller inclusive millisecond windows before exceeding the upstream pagination cap.

Data are partitioned by `(user_id, seller_id)`, including saved costs/expenses. Reconnecting a different seller cannot expose the previous seller's metrics. Shared Precify/extension saved studies remain NOVAI-account owned through the existing saved_items service.

New data tables are additive, initialized by init_db.py. The disabled legacy all-data pipeline remains disabled. We do not collect buyer identity, addresses, chat messages or arbitrary raw provider JSON.

Every seller API request goes through seller_ml.get → existing precify_api.ml_token. Refresh uses the existing row lock and 90-second expiry margin. A 401 invalidates only the token that failed and retries once after refresh. Requests have timeouts, bounded transient retries, fixed official origin and no redirects. Secrets never enter panel responses/logs. OAuth reconnect reuses existing expiring PKCE tickets, with a server-owned website return URL.

## API availability and financial definitions

Official documentation: https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-vendas (orders searchable up to 12 months); https://developers.mercadolivre.com.br/pt_br/product-ads-para-catalogo-e-user-products-leitura (Ads retention 90 days, new Ad Group endpoints); https://developers.mercadolivre.com.br/pt_br/gerenciamento-de-envios (sender shipping costs).

The application cannot recover the seller's entire pre-integration history from these endpoints. Stored history is retained going forward. Coverage is tracked per month/source; inaccessible or unfinished windows are not treated as zero. `Todo o histórico disponível` includes the account range and explicitly marks uncovered periods as partial.

Gross = order line quantity × actual unit price, for paid/partially_refunded/cancelled orders. Cancelled gross and payment refunds are separate (a cancelled order is never subtracted twice). Refunds are allocated proportionally across order lines. Orders are counted distinctly, units separately. Shipping uses sender costs allocated across all seller units in the shipment, so multi-order packs do not double-count shipping. Missing shipping/fees/refunds stay unknown.

Purchase cost and effective tax percentage are supplied by the seller and saved in PostgreSQL; updates apply to the selected historical period as explained in the form. Result = net after cancellations/refunds − purchase cost − fees − effective tax − seller shipping − Ads. Any missing input means no final result/margin is asserted. This is contribution result, not bank balance or accounting net profit. Refunds do not prove inventory recovery; post-shipment loss has no authoritative source here and stays unavailable, never fabricated as zero.

Campaigns use real campaign IDs/names. Ads are fetched through authorized advertisers → Ad Groups → per-item metrics, with item ownership checks. Attributed result allocates variable costs by attributed revenue; this is an estimate and does not prove incremental sales. Product and campaign metrics do not use fabricated category groupings.

Stock is the latest available quantity, Full when the API logistics type confirms fulfillment. Coverage/idle alerts require a completely collected sales period. Unknown current stock, dates or reputation are not assumed. Category names are fetched through the same authenticated client.

The reference's expense recurrence, date filters, CSV exports, details, charts, margin simulations and saved studies are retained. CSV cells are formula-escaped. The simulator uses explicit editable commission/freight/tax inputs; it does not silently insert the demo's 11.5/16.5/4 percent assumptions. Shared saves persist using the established backend service. No real ad campaigns, listing prices or payment actions are changed by the dashboard.

## Validation

Tests use an isolated PostgreSQL instance and mocked ML responses: ownership/JWT/CORS, token rotation, idempotent checkpoint resume, dense pagination, cancellation/refund separation, shared shipment allocation, missing inputs, coverage, current Ads endpoints, and persistent cost/expense/saved edits. Browser validation uses the same API/schema in a local test fixture, never production sales mutations.
