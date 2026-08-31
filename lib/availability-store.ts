import { pool } from "@/lib/db";
import type { AvailabilitySearchInput, Hut, HutAvailabilitySummary, UnitAvailability } from "@/types/availability";

const FRESH_FOR_MS = Number(process.env.AVAILABILITY_FRESH_FOR_MS ?? 15 * 60 * 1000);
const PRICE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function snapshotKey(hutId: string, input: AvailabilitySearchInput) {
  return [hutId, input.arrivalDate, input.departureDate, input.adults, input.children.map((child) => child.age).join(",")].join(":");
}

export async function getSnapshot(key: string): Promise<{ result: UnitAvailability[]; checkedAt: string; stale: boolean; sourceUrl: string; lastError?: string } | undefined> {
  const { rows } = await pool.query("SELECT result, checked_at, expires_at, source_url, last_error FROM availability_snapshots WHERE cache_key = $1", [key]);
  const row = rows[0];
  if (!row) return undefined;
  return { result: row.result, checkedAt: new Date(row.checked_at).toISOString(), stale: new Date(row.expires_at).getTime() <= Date.now(), sourceUrl: row.source_url, lastError: row.last_error ?? undefined };
}

export async function enqueueRefresh(key: string, hutId: string) {
  await pool.query(`INSERT INTO refresh_jobs (cache_key, hut_id, status)
    VALUES ($1, $2, 'queued')
    ON CONFLICT (cache_key) DO UPDATE SET
      status = CASE
        WHEN refresh_jobs.status = 'succeeded' THEN 'queued'
        WHEN refresh_jobs.status = 'failed' AND refresh_jobs.updated_at < now() - interval '5 minutes' THEN 'queued'
        ELSE refresh_jobs.status
      END,
      available_at = CASE
        WHEN refresh_jobs.status = 'succeeded' THEN now()
        WHEN refresh_jobs.status = 'failed' AND refresh_jobs.updated_at < now() - interval '5 minutes' THEN now()
        ELSE refresh_jobs.available_at
      END,
      updated_at = now()`, [key, hutId]);
}

async function getRefreshJob(key: string) {
  const { rows } = await pool.query<{ status: "queued" | "running" | "succeeded" | "failed"; last_error: string | null; updated_at: Date }>(
    "SELECT status, last_error, updated_at FROM refresh_jobs WHERE cache_key = $1",
    [key],
  );
  return rows[0];
}

export async function getStoredSummary(hut: HutAvailabilitySummary["hut"], input: AvailabilitySearchInput): Promise<HutAvailabilitySummary> {
  const key = snapshotKey(hut.id, input);
  const snapshot = await getSnapshot(key);
  let job = await getRefreshJob(key);
  const failedRecently = job?.status === "failed" && Date.now() - new Date(job.updated_at).getTime() < 5 * 60 * 1000;
  if ((!snapshot || snapshot.stale) && !failedRecently) {
    await enqueueRefresh(key, hut.id);
    job = await getRefreshJob(key);
  }
  const results = snapshot?.result ?? [];
  const lowest = results.filter((item) => item.status === "available" && item.price !== undefined).sort((a, b) => Number(a.price) - Number(b.price))[0];
  return { hut, results, status: job?.status === "failed" ? "error" : snapshot ? "checked" : "pending", availableCount: results.filter((item) => item.status === "available").length, unavailableCount: results.filter((item) => item.status === "unavailable").length, unresolvedCount: results.filter((item) => item.status === "unknown" || item.status === "error").length, lowestPrice: lowest?.price, lowestPriceDisplay: lowest?.priceDisplay, checkedAt: snapshot?.checkedAt ?? "", stale: snapshot?.stale ?? true, mode: "full", sourceUrl: snapshot?.sourceUrl ?? hut.bentralIframeUrl, errorMessage: job?.last_error ?? snapshot?.lastError };
}

export type StoredWeekAvailability = {
  hutId: string;
  arrivalDate: string;
  status: "available" | "unavailable" | "unknown";
};

/**
 * Loads an entire one-night availability grid and queues stale cache entries in
 * one database round trip. The worker still owns all upstream Bentral calls.
 */
export async function getStoredWeekAvailability(
  huts: Hut[],
  stays: Pick<AvailabilitySearchInput, "arrivalDate" | "departureDate">[],
): Promise<StoredWeekAvailability[]> {
  const requests = huts.flatMap((hut) =>
    stays.map((stay) => ({
      hutId: hut.id,
      arrivalDate: stay.arrivalDate,
      cacheKey: snapshotKey(hut.id, { ...stay, adults: 1, children: [] }),
    })),
  );

  if (requests.length === 0) return [];

  const cacheKeys = requests.map((request) => request.cacheKey);
  const hutIds = requests.map((request) => request.hutId);
  const arrivalDates = requests.map((request) => request.arrivalDate);
  const { rows } = await pool.query<{
    cache_key: string;
    hut_id: string;
    arrival_date: string;
    result: UnitAvailability[] | null;
    stale: boolean | null;
  }>(
    `WITH requested AS (
      SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
        AS request(cache_key, hut_id, arrival_date)
    ), snapshots AS (
      SELECT snapshot.cache_key, snapshot.result, snapshot.expires_at <= now() AS stale
      FROM availability_snapshots AS snapshot
      INNER JOIN requested USING (cache_key)
    ), queued AS (
      INSERT INTO refresh_jobs (cache_key, hut_id, status)
      SELECT request.cache_key, request.hut_id, 'queued'
      FROM requested AS request
      LEFT JOIN snapshots USING (cache_key)
      WHERE snapshots.cache_key IS NULL OR snapshots.stale
      ON CONFLICT (cache_key) DO UPDATE SET
        status = CASE WHEN refresh_jobs.status IN ('succeeded', 'failed') THEN 'queued' ELSE refresh_jobs.status END,
        available_at = CASE WHEN refresh_jobs.status IN ('succeeded', 'failed') THEN now() ELSE refresh_jobs.available_at END,
        updated_at = now()
    )
    SELECT request.cache_key, request.hut_id, request.arrival_date,
      snapshots.result, snapshots.stale
    FROM requested AS request
    LEFT JOIN snapshots USING (cache_key)`,
    [cacheKeys, hutIds, arrivalDates],
  );

  return rows.map((row) => ({
    hutId: row.hut_id,
    arrivalDate: row.arrival_date,
    status:
      !row.result || row.stale
        ? "unknown"
        : row.result.some((unit) => unit.status === "available")
          ? "available"
          : "unavailable",
  }));
}

export async function claimRefreshJob(workerId: string) {
  const { rows } = await pool.query(`WITH candidate AS (
      SELECT cache_key FROM refresh_jobs
      WHERE (status = 'queued' AND available_at <= now()) OR (status = 'running' AND locked_at < now() - interval '15 minutes')
      ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE refresh_jobs j SET status = 'running', attempts = j.attempts + 1, locked_at = now(), locked_by = $1, updated_at = now()
    FROM candidate WHERE j.cache_key = candidate.cache_key RETURNING j.cache_key, j.hut_id, j.attempts`, [workerId]);
  return rows[0] as { cache_key: string; hut_id: string; attempts: number } | undefined;
}

export async function saveSnapshot(key: string, hutId: string, input: AvailabilitySearchInput, result: UnitAvailability[], sourceUrl: string) {
  const checkedAt = new Date();
  const expiresAt = new Date(checkedAt.getTime() + FRESH_FOR_MS);
  await pool.query(`INSERT INTO availability_snapshots (cache_key, hut_id, arrival_date, departure_date, adults, children, result, checked_at, expires_at, source_url, last_error, error_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,NULL,now())
    ON CONFLICT (cache_key) DO UPDATE SET result=EXCLUDED.result, checked_at=EXCLUDED.checked_at, expires_at=EXCLUDED.expires_at, source_url=EXCLUDED.source_url, last_error=NULL, error_at=NULL, updated_at=now()`, [key, hutId, input.arrivalDate, input.departureDate, input.adults, JSON.stringify(input.children), JSON.stringify(result), checkedAt, expiresAt, sourceUrl]);
  await pool.query("UPDATE refresh_jobs SET status = 'succeeded', finished_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now() WHERE cache_key = $1", [key]);
}

export async function failRefresh(key: string, message: string) {
  await pool.query("UPDATE refresh_jobs SET status = 'failed', last_error = $2, finished_at = now(), locked_at = NULL, locked_by = NULL, updated_at = now() WHERE cache_key = $1", [key, message]);
  await pool.query("UPDATE availability_snapshots SET last_error = $2, error_at = now(), updated_at = now() WHERE cache_key = $1", [key, message]);
}

export async function getPrice(key: string): Promise<UnitAvailability | undefined> {
  const { rows } = await pool.query("SELECT result FROM unit_price_cache WHERE cache_key = $1 AND expires_at > now()", [key]);
  return rows[0]?.result;
}
export async function putPrice(key: string, result: UnitAvailability) {
  const now = new Date();
  await pool.query(`INSERT INTO unit_price_cache (cache_key, result, checked_at, expires_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (cache_key) DO UPDATE SET result=EXCLUDED.result, checked_at=EXCLUDED.checked_at, expires_at=EXCLUDED.expires_at`, [key, JSON.stringify(result), now, new Date(now.getTime() + PRICE_TTL_MS)]);
}
