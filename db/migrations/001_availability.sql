CREATE TABLE IF NOT EXISTS availability_snapshots (
  cache_key TEXT PRIMARY KEY,
  hut_id TEXT NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL,
  adults INTEGER NOT NULL CHECK (adults > 0),
  children JSONB NOT NULL,
  result JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  source_url TEXT NOT NULL,
  last_error TEXT,
  error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS availability_snapshots_hut_id_idx ON availability_snapshots (hut_id);

CREATE TABLE IF NOT EXISTS unit_price_cache (
  cache_key TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_jobs (
  cache_key TEXT PRIMARY KEY,
  hut_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_jobs_claim_idx ON refresh_jobs (status, available_at, created_at);
