import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [store, bentral, huts, database] = await Promise.all([
    import("@/lib/calendar-store"),
    import("@/lib/bentral"),
    import("@/lib/huts"),
    import("@/lib/db"),
  ]);
  const { claimRefreshJob } = await import("@/lib/availability-store");
  const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
  const delayMs = Number(process.env.BENTRAL_REQUEST_DELAY_MS ?? 0);
  const idleMs = Number(process.env.WORKER_IDLE_POLL_MS ?? 5000);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (;;) {
    const job = await claimRefreshJob(workerId);
    if (!job) {
      await sleep(idleMs);
      continue;
    }

    const hut = huts.getHut(job.hut_id);
    if (!hut) {
      await store.markJobFailed(job.cache_key, "Hut is no longer configured.");
      continue;
    }

    try {
      if (job.cache_key.startsWith("calendar:") || job.cache_key.startsWith("units:")) {
        const iframe = await bentral.fetchBentralIframe(hut);
        await store.saveCalendar({
          hut,
          units: iframe.units,
          userId: iframe.user,
          unavailableDates: iframe.unavailableDates,
          replaceUnits: job.cache_key.startsWith("units:"),
        });
      } else if (job.cache_key.startsWith("price:")) {
        const [, , unitId] = job.cache_key.split(":");
        if (!unitId) {
          throw new Error("Malformed price refresh job.");
        }
        let calendar = await store.getCalendar(hut.id);
        if (!calendar || calendar.stale || !calendar.userId) {
          const iframe = await bentral.fetchBentralIframe(hut);
          await store.saveCalendar({
            hut,
            units: iframe.units,
            userId: iframe.user,
            unavailableDates: iframe.unavailableDates,
          });
          calendar = await store.getCalendar(hut.id);
        }
        if (!calendar?.userId) {
          throw new Error("Bentral calendar did not provide a pricing user ID.");
        }
        const stay = firstAvailableNight(
          calendar.horizonStart,
          calendar.horizonEnd,
          calendar.unavailableDates[unitId],
          bentral.isUnitAvailableForStay,
        );
        if (!stay) throw new Error("No available night in the three-month calendar horizon.");
        const { arrivalDate, departureDate } = stay;
        const price = await bentral.fetchBentralPrice(hut, calendar.userId, unitId, {
          arrivalDate,
          departureDate,
          adults: 1,
          children: [],
        });
        await store.savePrice({ hutId: hut.id, unitId, arrivalDate, departureDate, ...price });
      } else {
        throw new Error("Legacy refresh job is no longer supported.");
      }

      await store.markJobSucceeded(job.cache_key);
      await sleep(delayMs);
    } catch (error) {
      await store.markJobFailed(
        job.cache_key,
        error instanceof Error ? error.message : "Refresh failed.",
      );
    }
  }

  // Kept for graceful shutdown tooling.
  await database.pool.end();
}

function firstAvailableNight(
  horizonStart: string,
  horizonEnd: string,
  calendar: Record<string, "unavail" | "unavail_start" | "unavail_end"> | undefined,
  isAvailable: (
    calendar: Record<string, "unavail" | "unavail_start" | "unavail_end"> | undefined,
    arrivalDate: string,
    departureDate: string,
  ) => boolean,
) {
  const cursor = new Date(`${horizonStart}T00:00:00.000Z`);
  const end = new Date(`${horizonEnd}T00:00:00.000Z`);
  while (cursor < end) {
    const arrivalDate = cursor.toISOString().slice(0, 10);
    const departure = new Date(cursor);
    departure.setUTCDate(departure.getUTCDate() + 1);
    const departureDate = departure.toISOString().slice(0, 10);
    if (isAvailable(calendar, arrivalDate, departureDate)) {
      return { arrivalDate, departureDate };
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return undefined;
}

main().catch((error) => {
  console.error("Worker stopped", error);
  process.exitCode = 1;
});
