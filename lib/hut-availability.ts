import {
  checkAllUnitsAvailability,
  checkFirstAvailableUnitAvailability,
} from "@/lib/bentral";
import type {
  AvailabilitySearchInput,
  Hut,
  HutAvailabilitySummary,
  UnitAvailability,
} from "@/types/availability";

export async function checkHutsAvailability(
  huts: Hut[],
  input: AvailabilitySearchInput,
  mode: "quick" | "full" = "quick",
): Promise<HutAvailabilitySummary[]> {
  const queue = [...huts];
  const results: HutAvailabilitySummary[] = [];
  const concurrency = 1;

  async function worker() {
    while (queue.length > 0) {
      const hut = queue.shift();

      if (!hut) {
        return;
      }

      results.push(await checkHutAvailability(hut, input, mode));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return huts.map((hut) => {
    const result = results.find((item) => item.hut.id === hut.id);

    return (
      result ?? {
        hut,
        results: [],
        status: "error",
        availableCount: 0,
        unavailableCount: 0,
        unresolvedCount: 1,
        checkedAt: new Date().toISOString(),
        mode,
        errorMessage: "No result returned for this hut.",
      }
    );
  });
}

export async function checkHutAvailability(
  hut: Hut,
  input: AvailabilitySearchInput,
  mode: "quick" | "full" = "full",
): Promise<HutAvailabilitySummary> {
  const checkedAt = new Date().toISOString();

  try {
    const results =
      mode === "quick"
        ? await checkFirstAvailableUnitAvailability(hut, input)
        : await checkAllUnitsAvailability(hut, input);
    const lowest = findLowestAvailablePrice(results);
    const stale = results.some((result) => result.stale);

    return {
      hut,
      results,
      status: "checked",
      availableCount: results.filter((result) => result.status === "available").length,
      unavailableCount: results.filter((result) => result.status === "unavailable").length,
      unresolvedCount: results.filter(
        (result) => result.status === "unknown" || result.status === "error",
      ).length,
      lowestPrice: lowest?.price,
      lowestPriceDisplay: lowest?.priceDisplay,
      checkedAt,
      stale,
      mode,
    };
  } catch (error) {
    return {
      hut,
      results: [],
      status: "error",
      availableCount: 0,
      unavailableCount: 0,
      unresolvedCount: 1,
      checkedAt,
      mode,
      errorMessage:
        error instanceof Error ? error.message : "Could not check this hut.",
    };
  }
}

function findLowestAvailablePrice(results: UnitAvailability[]) {
  return results
    .filter((result) => result.status === "available" && result.price !== undefined)
    .sort((a, b) => Number(a.price) - Number(b.price))[0];
}
