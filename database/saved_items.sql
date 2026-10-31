CREATE TABLE IF NOT EXISTS novai_saved_items (
  user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL CHECK (item_key ~ '^MLBU?[0-9]{6,16}$'),
  url TEXT NOT NULL,
  extension_data JSONB NOT NULL,
  app_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id,item_key)
);
CREATE INDEX IF NOT EXISTS novai_saved_items_account_updated ON novai_saved_items(user_id,updated_at DESC);
