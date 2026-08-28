import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const [{ claimRefreshJob, failRefresh, getPrice, putPrice, saveSnapshot, snapshotKey }, { checkAllUnitsAvailability }, { getHut }, { pool }] = await Promise.all([
    import("@/lib/availability-store"), import("@/lib/bentral"), import("@/lib/huts"), import("@/lib/db"),
  ]);
  const workerId = process.env.WORKER_ID ?? `worker-${process.pid}`;
  const delayMs = Number(process.env.BENTRAL_REQUEST_DELAY_MS ?? 0);
  const idleMs = Number(process.env.WORKER_IDLE_POLL_MS ?? 5000);
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (;;) {
    const job = await claimRefreshJob(workerId);
    if (!job) { await sleep(idleMs); continue; }
    const hut = getHut(job.hut_id);
    if (!hut) { await failRefresh(job.cache_key, "Hut is no longer configured."); continue; }
    const parts = job.cache_key.split(":");
    const input = { arrivalDate: parts[1], departureDate: parts[2], adults: Number(parts[3]), children: (parts[4] ? parts[4].split(",").map((age) => ({ age: Number(age) })) : []) };
    try {
      const results = await checkAllUnitsAvailability(hut, input, { get: getPrice, put: putPrice });
      await saveSnapshot(snapshotKey(hut.id, input), hut.id, input, results, hut.bentralIframeUrl);
      await sleep(delayMs);
    } catch (error) {
      await failRefresh(job.cache_key, error instanceof Error ? error.message : "Refresh failed.");
    }
  }
  // Kept for graceful shutdown tooling.
  await pool.end();
}

main().catch((error) => { console.error("Worker stopped", error); process.exitCode = 1; });
