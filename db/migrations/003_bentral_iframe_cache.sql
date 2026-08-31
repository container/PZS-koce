CREATE TABLE IF NOT EXISTS bentral_iframe_cache (
  hut_id TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS bentral_iframe_cache_expires_at_idx
  ON bentral_iframe_cache (expires_at);
