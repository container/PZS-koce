CREATE TABLE IF NOT EXISTS bentral_requests (
  id BIGSERIAL PRIMARY KEY,
  hut_id TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('iframe', 'availability')),
  unit_id TEXT,
  arrival_date DATE,
  departure_date DATE,
  response_status INTEGER,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bentral_requests_created_at_idx
  ON bentral_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS bentral_requests_hut_id_idx
  ON bentral_requests (hut_id, created_at DESC);
