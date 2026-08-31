import { pool } from "@/lib/db";

type RequestType = "iframe" | "availability";

type BentralRequestInput = {
  hutId: string;
  requestType: RequestType;
  unitId?: string;
  arrivalDate?: string;
  departureDate?: string;
};

export async function beginBentralRequest(input: BentralRequestInput) {
  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO bentral_requests
        (hut_id, request_type, unit_id, arrival_date, departure_date, response_status, duration_ms, error_message)
       VALUES ($1,$2,$3,$4,$5,NULL,0,NULL)
       RETURNING id`,
      [
        input.hutId,
        input.requestType,
        input.unitId ?? null,
        input.arrivalDate ?? null,
        input.departureDate ?? null,
      ],
    );
    return result.rows[0]?.id ?? null;
  } catch (error) {
    console.warn("[admin] failed to start Bentral request log", error);
    return null;
  }
}

export async function finishBentralRequest(input: {
  id: string | null;
  responseStatus?: number;
  durationMs: number;
  errorMessage?: string;
}) {
  if (!input.id) return;

  try {
    await pool.query(
      `UPDATE bentral_requests
       SET response_status = $2, duration_ms = $3, error_message = $4
       WHERE id = $1`,
      [input.id, input.responseStatus ?? null, input.durationMs, input.errorMessage ?? null],
    );
  } catch (error) {
    console.warn("[admin] failed to finish Bentral request log", error);
  }
}

export async function getAdminMetrics() {
  const [requestCounts, requestTypes, caches, jobs, recentRequests, recentSnapshots] =
    await Promise.all([
      pool.query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour')::int AS last_hour,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS last_day,
        COUNT(*) FILTER (WHERE error_message IS NOT NULL OR response_status >= 400)::int AS failed
        FROM bentral_requests`),
      pool.query(`SELECT request_type, COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS last_day
        FROM bentral_requests GROUP BY request_type ORDER BY request_type`),
      pool.query(`SELECT
        (SELECT COUNT(*)::int FROM availability_snapshots) AS availability_total,
        (SELECT COUNT(*)::int FROM availability_snapshots WHERE expires_at > now()) AS availability_fresh,
        (SELECT COUNT(*)::int FROM availability_snapshots WHERE expires_at <= now()) AS availability_stale,
        (SELECT COUNT(*)::int FROM unit_price_cache WHERE expires_at > now()) AS price_fresh`),
      pool.query(`SELECT status, COUNT(*)::int AS total
        FROM refresh_jobs GROUP BY status ORDER BY status`),
      pool.query(`SELECT hut_id, request_type, unit_id, arrival_date, departure_date,
          response_status, duration_ms, error_message, created_at
        FROM bentral_requests ORDER BY id DESC LIMIT 100`),
      pool.query(`SELECT hut_id, arrival_date, departure_date, adults, checked_at, expires_at,
          jsonb_array_length(result) AS unit_count
        FROM availability_snapshots ORDER BY checked_at DESC LIMIT 12`),
    ]);

  return {
    requestCounts: requestCounts.rows[0] as {
      total: number;
      last_hour: number;
      last_day: number;
      failed: number;
    },
    requestTypes: requestTypes.rows as { request_type: RequestType; total: number; last_day: number }[],
    caches: caches.rows[0] as {
      availability_total: number;
      availability_fresh: number;
      availability_stale: number;
      price_fresh: number;
    },
    jobs: jobs.rows as { status: string; total: number }[],
    recentRequests: recentRequests.rows as Array<{
      hut_id: string;
      request_type: RequestType;
      unit_id: string | null;
      arrival_date: string | Date | null;
      departure_date: string | Date | null;
      response_status: number | null;
      duration_ms: number;
      error_message: string | null;
      created_at: string | Date;
    }>,
    recentSnapshots: recentSnapshots.rows as Array<{
      hut_id: string;
      arrival_date: string | Date;
      departure_date: string | Date;
      adults: number;
      checked_at: string | Date;
      expires_at: string | Date;
      unit_count: number;
    }>,
  };
}
