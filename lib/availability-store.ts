import { isUnitAvailableForStay } from "@/lib/bentral";
import {
  calendarJobKey,
  enqueueJob,
  getCalendar,
  getPrices,
  getUnits,
} from "@/lib/calendar-store";
import { pool } from "@/lib/db";
import type {
  AvailabilitySearchInput,
  Hut,
  HutAvailabilitySummary,
  UnitAvailability,
} from "@/types/availability";

type RefreshJob = {
  status: "queued" | "running" | "succeeded" | "failed";
  last_error: string | null;
  updated_at: Date;
};

async function getRefreshJob(key: string) {
  const { rows } = await pool.query<RefreshJob>(
    "SELECT status, last_error, updated_at FROM refresh_jobs WHERE cache_key = $1",
    [key],
  );
  return rows[0];
}

export async function getStoredSummary(
  hut: HutAvailabilitySummary["hut"],
  input: AvailabilitySearchInput,
): Promise<HutAvailabilitySummary> {
  const key = calendarJobKey(hut.id);
  const [calendar, units] = await Promise.all([getCalendar(hut.id), getUnits(hut.id)]);
  let job = await getRefreshJob(key);
  const failedRecently =
    job?.status === "failed" &&
    Date.now() - new Date(job.updated_at).getTime() < 5 * 60 * 1000;

  if ((!calendar || calendar.stale) && !failedRecently) {
    await enqueueJob(key, hut.id);
    job = await getRefreshJob(key);
  }

  if (!calendar || units.length === 0) {
    return {
      hut,
      results: [],
      status: job?.status === "failed" ? "error" : "pending",
      availableCount: 0,
      unavailableCount: 0,
      unresolvedCount: 0,
      checkedAt: "",
      stale: true,
      mode: "full",
      sourceUrl: hut.bentralIframeUrl,
      errorMessage: job?.last_error ?? undefined,
    };
  }

  const availableUnits = units.filter((unit) =>
    isUnitAvailableForStay(
      calendar.unavailableDates[unit.bentralUnitId],
      input.arrivalDate,
      input.departureDate,
    ),
  );
  const prices = await getPrices(hut.id, availableUnits.map((unit) => unit.bentralUnitId));
  const availableIds = new Set(availableUnits.map((unit) => unit.bentralUnitId));
  const results: UnitAvailability[] = units.map((unit) => {
    const available = availableIds.has(unit.bentralUnitId);
    const cachedPrice = prices.get(unit.bentralUnitId);
    return {
      bentralUnitId: unit.bentralUnitId,
      unitName: unit.name,
      status: available ? "available" : "unavailable",
      price: cachedPrice?.price,
      priceDisplay: cachedPrice?.priceDisplay,
      cached: true,
      cachedAt: calendar.checkedAt,
      stale: calendar.stale,
    };
  });

  const lowest = results
    .filter((item) => item.status === "available" && item.price !== undefined)
    .sort((a, b) => Number(a.price) - Number(b.price))[0];

  return {
    hut,
    results,
    status: "checked",
    availableCount: results.filter((item) => item.status === "available").length,
    unavailableCount: results.filter((item) => item.status === "unavailable").length,
    unresolvedCount: 0,
    lowestPrice: lowest?.price,
    lowestPriceDisplay: lowest?.priceDisplay,
    checkedAt: calendar.checkedAt,
    stale: calendar.stale,
    mode: "full",
    sourceUrl: calendar.sourceUrl || hut.bentralIframeUrl,
    errorMessage: job?.status === "failed" ? job.last_error ?? undefined : calendar.lastError,
  };
}

export type StoredWeekAvailability = {
  hutId: string;
  arrivalDate: string;
  status: "available" | "unavailable" | "unknown";
};

export async function getStoredWeekAvailability(
  huts: Hut[],
  stays: Pick<AvailabilitySearchInput, "arrivalDate" | "departureDate">[],
): Promise<StoredWeekAvailability[]> {
  const output: StoredWeekAvailability[] = [];

  for (const hut of huts) {
    const [calendar, units] = await Promise.all([getCalendar(hut.id), getUnits(hut.id)]);
    if (!calendar || calendar.stale) await enqueueJob(calendarJobKey(hut.id), hut.id);

    for (const stay of stays) {
      const status = !calendar || units.length === 0
        ? "unknown"
        : units.some((unit) =>
            isUnitAvailableForStay(
              calendar.unavailableDates[unit.bentralUnitId],
              stay.arrivalDate,
              stay.departureDate,
            ),
          )
          ? "available"
          : "unavailable";
      output.push({ hutId: hut.id, arrivalDate: stay.arrivalDate, status });
    }
  }

  return output;
}

export async function claimRefreshJob(workerId: string) {
  const { rows } = await pool.query(
    `WITH candidate AS (
       SELECT cache_key FROM refresh_jobs
       WHERE (status = 'queued' AND available_at <= now())
          OR (status = 'running' AND locked_at < now() - interval '15 minutes')
       ORDER BY available_at, created_at
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE refresh_jobs j SET
       status='running', attempts=j.attempts+1, locked_at=now(), locked_by=$1, updated_at=now()
     FROM candidate WHERE j.cache_key=candidate.cache_key
     RETURNING j.cache_key, j.hut_id, j.attempts`,
    [workerId],
  );
  return rows[0] as
    | { cache_key: string; hut_id: string; attempts: number }
    | undefined;
}
