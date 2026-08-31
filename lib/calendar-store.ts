import { pool } from "@/lib/db";
import type { AccommodationUnit, Hut, UnitAvailability } from "@/types/availability";

export type UnavailabilityMarker = "unavail" | "unavail_start" | "unavail_end";
export type UnavailabilityCalendar = Record<string, Record<string, UnavailabilityMarker>>;

export const CALENDAR_FRESH_FOR_MS = Number(
  process.env.AVAILABILITY_FRESH_FOR_MS ?? 15 * 60 * 1000,
);
export const CALENDAR_HORIZON_MONTHS = 3;

type CalendarRow = {
  unavailable_dates: UnavailabilityCalendar;
  user_id: string;
  checked_at: Date;
  expires_at: Date;
  horizon_start: string | Date;
  horizon_end: string | Date;
  source_url: string;
  last_error: string | null;
};

export type StoredCalendar = {
  unavailableDates: UnavailabilityCalendar;
  userId: string;
  checkedAt: string;
  expiresAt: string;
  horizonStart: string;
  horizonEnd: string;
  sourceUrl: string;
  stale: boolean;
  lastError?: string;
};

export function calendarJobKey(hutId: string) {
  return `calendar:${hutId}`;
}

export function unitsJobKey(hutId: string) {
  return `units:${hutId}`;
}

export function priceKey(hutId: string, unitId: string) {
  return `price:${hutId}:${unitId}`;
}

export function priceJobKey(hutId: string, unitId: string) {
  return priceKey(hutId, unitId);
}

export async function enqueueJob(key: string, hutId: string, force = false) {
  await pool.query(
    `INSERT INTO refresh_jobs (cache_key, hut_id, status)
     VALUES ($1, $2, 'queued')
     ON CONFLICT (cache_key) DO UPDATE SET
       status = CASE
         WHEN $3::boolean THEN 'queued'
         WHEN refresh_jobs.status = 'succeeded' THEN 'queued'
         WHEN refresh_jobs.status = 'failed' AND refresh_jobs.updated_at < now() - interval '5 minutes' THEN 'queued'
         ELSE refresh_jobs.status
       END,
       available_at = CASE
         WHEN $3::boolean OR refresh_jobs.status = 'succeeded' THEN now()
         WHEN refresh_jobs.status = 'failed' AND refresh_jobs.updated_at < now() - interval '5 minutes' THEN now()
         ELSE refresh_jobs.available_at
       END,
       last_error = CASE WHEN $3::boolean THEN NULL ELSE refresh_jobs.last_error END,
       updated_at = now()`,
    [key, hutId, force],
  );
}

export async function getCalendar(hutId: string): Promise<StoredCalendar | undefined> {
  const { rows } = await pool.query<CalendarRow>(
    `SELECT unavailable_dates, user_id, checked_at, expires_at,
       horizon_start, horizon_end, source_url, last_error
     FROM bentral_calendars WHERE hut_id = $1`,
    [hutId],
  );
  const row = rows[0];
  if (!row) return undefined;
  const dateOnly = (value: string | Date) =>
    typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return {
    unavailableDates: row.unavailable_dates,
    userId: row.user_id,
    checkedAt: row.checked_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    horizonStart: dateOnly(row.horizon_start),
    horizonEnd: dateOnly(row.horizon_end),
    sourceUrl: row.source_url,
    stale: row.expires_at.getTime() <= Date.now(),
    lastError: row.last_error ?? undefined,
  };
}

export async function getUnits(hutId: string): Promise<AccommodationUnit[]> {
  const { rows } = await pool.query<{
    unit_id: string;
    name: string;
    capacity: number | null;
    available_unit_count: number | null;
    max_adults: number | null;
    max_children: number | null;
  }>(
    `SELECT unit_id, name, capacity, available_unit_count, max_adults, max_children
     FROM bentral_units WHERE hut_id = $1 ORDER BY name`,
    [hutId],
  );
  return rows.map((row) => ({
    bentralUnitId: row.unit_id,
    name: row.name,
    capacity: row.capacity ?? undefined,
    availableUnitCount: row.available_unit_count ?? undefined,
    maxAdults: row.max_adults ?? undefined,
    maxChildren: row.max_children ?? undefined,
  }));
}

export async function saveCalendar(input: {
  hut: Hut;
  units: AccommodationUnit[];
  userId: string;
  unavailableDates: UnavailabilityCalendar;
  replaceUnits?: boolean;
}) {
  const checkedAt = new Date();
  const expiresAt = new Date(checkedAt.getTime() + CALENDAR_FRESH_FOR_MS);
  const horizonStart = checkedAt.toISOString().slice(0, 10);
  const horizonEndDate = new Date(`${horizonStart}T00:00:00.000Z`);
  horizonEndDate.setUTCMonth(horizonEndDate.getUTCMonth() + CALENDAR_HORIZON_MONTHS);
  const horizonEnd = horizonEndDate.toISOString().slice(0, 10);
  const trimmed = trimCalendar(input.unavailableDates, horizonStart, horizonEnd);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO bentral_calendars
        (hut_id, unavailable_dates, user_id, checked_at, expires_at, horizon_start, horizon_end, source_url, last_error, error_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,now())
       ON CONFLICT (hut_id) DO UPDATE SET
         unavailable_dates=EXCLUDED.unavailable_dates,
         user_id=EXCLUDED.user_id,
         checked_at=EXCLUDED.checked_at,
         expires_at=EXCLUDED.expires_at,
         horizon_start=EXCLUDED.horizon_start,
         horizon_end=EXCLUDED.horizon_end,
         source_url=EXCLUDED.source_url,
         last_error=NULL,
         error_at=NULL,
         updated_at=now()`,
      [input.hut.id, JSON.stringify(trimmed), input.userId, checkedAt, expiresAt, horizonStart, horizonEnd, input.hut.bentralIframeUrl],
    );

    const existing = await client.query("SELECT 1 FROM bentral_units WHERE hut_id = $1 LIMIT 1", [input.hut.id]);
    if (input.replaceUnits) {
      await client.query("DELETE FROM bentral_units WHERE hut_id = $1", [input.hut.id]);
    }
    if (input.replaceUnits || existing.rowCount === 0) {
      for (const unit of input.units) {
        await client.query(
          `INSERT INTO bentral_units
            (hut_id, unit_id, name, capacity, available_unit_count, max_adults, max_children, source_checked_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (hut_id, unit_id) DO UPDATE SET
             name=EXCLUDED.name,
             capacity=EXCLUDED.capacity,
             available_unit_count=EXCLUDED.available_unit_count,
             max_adults=EXCLUDED.max_adults,
             max_children=EXCLUDED.max_children,
             source_checked_at=EXCLUDED.source_checked_at,
             updated_at=now()`,
          [input.hut.id, unit.bentralUnitId, unit.name, unit.capacity ?? null, unit.availableUnitCount ?? null, unit.maxAdults ?? null, unit.maxChildren ?? null, checkedAt],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getPrices(hutId: string, unitIds: string[]) {
  if (unitIds.length === 0) return new Map<string, UnitAvailability>();
  const { rows } = await pool.query<{
    unit_id: string;
    price: string | null;
    price_display: string | null;
    checked_at: Date | null;
  }>(
    `SELECT DISTINCT ON (unit_id) unit_id, price, price_display, checked_at FROM bentral_prices
     WHERE hut_id = $1 AND unit_id = ANY($2::text[])
       AND checked_at IS NOT NULL
     ORDER BY unit_id, checked_at DESC`,
    [hutId, unitIds],
  );
  return new Map(rows.map((row) => [row.unit_id, {
    bentralUnitId: row.unit_id,
    unitName: "",
    status: "available" as const,
    price: row.price === null ? undefined : Number(row.price),
    priceDisplay: row.price_display ?? undefined,
    cached: true,
    cachedAt: row.checked_at?.toISOString(),
  }]));
}

export async function savePrice(input: {
  hutId: string;
  unitId: string;
  arrivalDate: string;
  departureDate: string;
  price?: number;
  priceDisplay?: string;
}) {
  const key = priceKey(input.hutId, input.unitId);
  await pool.query(
    `INSERT INTO bentral_prices
      (cache_key, hut_id, unit_id, arrival_date, departure_date, price, price_display, checked_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())
     ON CONFLICT (cache_key) DO UPDATE SET
       price=EXCLUDED.price,
       price_display=EXCLUDED.price_display,
       checked_at=EXCLUDED.checked_at,
       updated_at=now()`,
    [key, input.hutId, input.unitId, input.arrivalDate, input.departureDate, input.price ?? null, input.priceDisplay ?? null],
  );
}

export async function markJobSucceeded(key: string) {
  await pool.query(
    "UPDATE refresh_jobs SET status='succeeded', finished_at=now(), locked_at=NULL, locked_by=NULL, last_error=NULL, updated_at=now() WHERE cache_key=$1",
    [key],
  );
}

export async function markJobFailed(key: string, message: string) {
  await pool.query(
    "UPDATE refresh_jobs SET status='failed', last_error=$2, finished_at=now(), locked_at=NULL, locked_by=NULL, updated_at=now() WHERE cache_key=$1",
    [key, message],
  );
  if (key.startsWith("calendar:") || key.startsWith("units:")) {
    await pool.query(
      "UPDATE bentral_calendars SET last_error=$2, error_at=now(), updated_at=now() WHERE hut_id=$1",
      [key.slice(key.indexOf(":") + 1), message],
    );
  }
}

function trimCalendar(calendar: UnavailabilityCalendar, start: string, end: string) {
  return Object.fromEntries(Object.entries(calendar).map(([unitId, dates]) => [
    unitId,
    Object.fromEntries(Object.entries(dates).filter(([date]) => date >= start && date <= end)),
  ]));
}
