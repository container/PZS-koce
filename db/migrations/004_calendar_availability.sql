CREATE TABLE IF NOT EXISTS bentral_units (
  hut_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER,
  available_unit_count INTEGER,
  max_adults INTEGER,
  max_children INTEGER,
  source_checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hut_id, unit_id)
);

CREATE TABLE IF NOT EXISTS bentral_calendars (
  hut_id TEXT PRIMARY KEY,
  unavailable_dates JSONB NOT NULL,
  user_id TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  horizon_start DATE NOT NULL,
  horizon_end DATE NOT NULL,
  source_url TEXT NOT NULL,
  last_error TEXT,
  error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bentral_calendars_expires_at_idx
  ON bentral_calendars (expires_at);

CREATE TABLE IF NOT EXISTS bentral_prices (
  cache_key TEXT PRIMARY KEY,
  hut_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  arrival_date DATE,
  departure_date DATE,
  price NUMERIC,
  price_display TEXT,
  checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bentral_prices_hut_id_idx
  ON bentral_prices (hut_id, checked_at DESC);

INSERT INTO bentral_units
  (hut_id, unit_id, name, capacity, available_unit_count, max_adults, max_children, source_checked_at)
SELECT cache.hut_id,
  unit->>'bentralUnitId',
  unit->>'name',
  NULLIF(unit->>'capacity', '')::integer,
  NULLIF(unit->>'availableUnitCount', '')::integer,
  NULLIF(unit->>'maxAdults', '')::integer,
  NULLIF(unit->>'maxChildren', '')::integer,
  cache.checked_at
FROM bentral_iframe_cache AS cache
CROSS JOIN LATERAL jsonb_array_elements(cache.result->'units') AS unit
WHERE unit->>'bentralUnitId' IS NOT NULL AND unit->>'name' IS NOT NULL
ON CONFLICT (hut_id, unit_id) DO NOTHING;

INSERT INTO bentral_calendars
  (hut_id, unavailable_dates, user_id, checked_at, expires_at, horizon_start, horizon_end, source_url)
SELECT hut_id,
  COALESCE(result->'unavailableDates', '{}'::jsonb),
  COALESCE(result->>'user', ''),
  checked_at,
  checked_at + interval '15 minutes',
  current_date,
  current_date + 92,
  ''
FROM bentral_iframe_cache
ON CONFLICT (hut_id) DO NOTHING;

INSERT INTO bentral_prices
  (cache_key, hut_id, unit_id, arrival_date, departure_date, price, price_display, checked_at)
SELECT
  'price:' || legacy.hut_id || ':' || legacy.unit_id,
  legacy.hut_id,
  legacy.unit_id,
  legacy.arrival_date,
  legacy.departure_date,
  legacy.price,
  legacy.price_display,
  legacy.checked_at
FROM (
  SELECT DISTINCT ON (split_part(cache_key, ':', 2), split_part(cache_key, ':', 3))
    split_part(cache_key, ':', 2) AS hut_id,
    split_part(cache_key, ':', 3) AS unit_id,
    split_part(cache_key, ':', 4)::date AS arrival_date,
    split_part(cache_key, ':', 5)::date AS departure_date,
    NULLIF(result->>'price', '')::numeric AS price,
    result->>'priceDisplay' AS price_display,
    checked_at
  FROM unit_price_cache
  WHERE cache_key LIKE 'availability:%'
    AND split_part(cache_key, ':', 6) = '1'
    AND COALESCE(result->>'priceDisplay', '') <> ''
  ORDER BY split_part(cache_key, ':', 2), split_part(cache_key, ':', 3), checked_at DESC
) AS legacy
ON CONFLICT (cache_key) DO NOTHING;
