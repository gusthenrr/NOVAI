-- Additive seller analytics, always partitioned by NOVAI account AND ML seller.
CREATE TABLE IF NOT EXISTS seller_sync (
 user_id BIGINT REFERENCES usuarios(id) ON DELETE CASCADE, seller_id BIGINT NOT NULL,
 nickname TEXT, reputation TEXT, registered_on DATE, available_from DATE, initialized BOOLEAN NOT NULL DEFAULT FALSE,
 revision BIGINT NOT NULL DEFAULT 0, touched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,seller_id)
);
CREATE TABLE IF NOT EXISTS seller_jobs (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL, seller_id BIGINT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('profile','catalog','orders','ads')), period DATE NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued', cursor JSONB NOT NULL DEFAULT '{}',
 attempts INTEGER NOT NULL DEFAULT 0, error TEXT, lease TEXT, lease_until TIMESTAMPTZ,
 coverage_from DATE, next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), finished_at TIMESTAMPTZ,
 UNIQUE(user_id,seller_id,kind,period),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS seller_jobs_due ON seller_jobs(next_at,period DESC) WHERE state IN ('queued','running','retry');
CREATE TABLE IF NOT EXISTS seller_products (
 user_id BIGINT NOT NULL, seller_id BIGINT NOT NULL, item_id TEXT NOT NULL,
 data JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,seller_id,item_id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS seller_orders (
 user_id BIGINT NOT NULL, seller_id BIGINT NOT NULL, order_id TEXT NOT NULL,
 day DATE NOT NULL, shipment_id TEXT, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,seller_id,order_id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS seller_orders_period ON seller_orders(user_id,seller_id,day);
CREATE TABLE IF NOT EXISTS seller_shipping (
 user_id BIGINT NOT NULL,seller_id BIGINT NOT NULL,shipment_id TEXT NOT NULL,
 cost NUMERIC(18,2), units NUMERIC, status TEXT NOT NULL,
 PRIMARY KEY(user_id,seller_id,shipment_id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS seller_ads (
 user_id BIGINT NOT NULL,seller_id BIGINT NOT NULL,day DATE NOT NULL,
 campaign_id TEXT NOT NULL,campaign_name TEXT NOT NULL,ad_group_id TEXT NOT NULL,item_id TEXT NOT NULL,
 data JSONB NOT NULL,PRIMARY KEY(user_id,seller_id,day,ad_group_id,item_id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS seller_costs (
 user_id BIGINT NOT NULL,seller_id BIGINT NOT NULL,item_id TEXT NOT NULL,
 unit_cost NUMERIC(18,2),tax_percent NUMERIC(8,4),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,seller_id,item_id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE,
 CHECK(unit_cost>=0),CHECK(tax_percent BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS seller_expenses (
 user_id BIGINT NOT NULL,seller_id BIGINT NOT NULL,id UUID NOT NULL,
 name TEXT NOT NULL,category TEXT NOT NULL,amount NUMERIC(18,2) NOT NULL CHECK(amount>0),
 day DATE NOT NULL,recurring BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(user_id,seller_id,id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);

-- Panel v4: additive settings, optimistic revision, visit cache and stock provenance.
ALTER TABLE seller_expenses ADD COLUMN IF NOT EXISTS expense_type TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE seller_expenses ADD COLUMN IF NOT EXISTS installments INTEGER;
ALTER TABLE seller_shipping ADD COLUMN IF NOT EXISTS logistic_type TEXT;
CREATE TABLE IF NOT EXISTS seller_panel_settings (
 user_id BIGINT NOT NULL,seller_id BIGINT NOT NULL,version BIGINT NOT NULL DEFAULT 0,
 data JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,seller_id),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS seller_visit_cache (
 user_id BIGINT NOT NULL,seller_id BIGINT NOT NULL,item_id TEXT NOT NULL,start_day DATE NOT NULL,end_day DATE NOT NULL,
 data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,seller_id,item_id,start_day,end_day),
 FOREIGN KEY(user_id,seller_id) REFERENCES seller_sync(user_id,seller_id) ON DELETE CASCADE
);
