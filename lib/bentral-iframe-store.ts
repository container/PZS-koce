import { pool } from "@/lib/db";
import type { AccommodationUnit } from "@/types/availability";

export type CachedBentralIframe = {
  units: AccommodationUnit[];
  user: string;
  unavailableDates: Record<string, Record<string, "unavail" | "unavail_start" | "unavail_end">>;
};

export async function getCachedBentralIframe(hutId: string): Promise<CachedBentralIframe | undefined> {
  const { rows } = await pool.query<{ result: CachedBentralIframe }>(
    "SELECT result FROM bentral_iframe_cache WHERE hut_id = $1 AND expires_at > now()",
    [hutId],
  );
  return rows[0]?.result;
}

export async function putCachedBentralIframe(hutId: string, result: CachedBentralIframe, ttlMs: number) {
  const checkedAt = new Date();
  const expiresAt = new Date(checkedAt.getTime() + ttlMs);
  await pool.query(
    `INSERT INTO bentral_iframe_cache (hut_id, result, checked_at, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (hut_id) DO UPDATE SET
       result = EXCLUDED.result,
       checked_at = EXCLUDED.checked_at,
       expires_at = EXCLUDED.expires_at`,
    [hutId, JSON.stringify(result), checkedAt, expiresAt],
  );
}
