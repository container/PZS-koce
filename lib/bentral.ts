import * as cheerio from "cheerio";
import { beginBentralRequest, finishBentralRequest } from "@/lib/admin-metrics";
import { getOrSetCached, getCachedEntry, setCached } from "@/lib/cache";
import { formatBentralDate } from "@/lib/validation";
import type {
  AccommodationUnit,
  AvailabilitySearchInput,
  Hut,
  UnitAvailability,
} from "@/types/availability";

const UNITS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PRICE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_AVAILABILITY_TTL_MS = 15 * 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const IFRAME_CACHE_VERSION = "v2";
const BENTRAL_AVAILABILITY_URL =
  "https://www.bentral.com/service/embed/ajax/order?action=available-pricings&currency=eur&lang=sl";

type UnavailabilityMarker = "unavail" | "unavail_start" | "unavail_end";
type UnavailabilityCalendar = Record<string, Record<string, UnavailabilityMarker>>;

type ParsedIframe = {
  units: AccommodationUnit[];
  user: string;
  unavailableDates: UnavailabilityCalendar;
};

type Pricing = {
  amount?: number;
  amount_show?: string;
};

type BentralAvailabilityPayload = {
  pricings_available?: Pricing[];
};

export type PriceCache = {
  get(key: string): Promise<UnitAvailability | undefined>;
  put(key: string, value: UnitAvailability): Promise<void>;
};

export async function getAccommodationUnits(
  hut: Hut,
): Promise<{ units: AccommodationUnit[]; cached: boolean }> {
  const result = await getOrSetCached<ParsedIframe>(
    getIframeCacheKey(hut.id),
    UNITS_TTL_MS,
    () => fetchAndParseIframe(hut),
  );

  return {
    units: result.value.units,
    cached: result.cached,
  };
}

export async function checkAllUnitsAvailability(
  hut: Hut,
  input: AvailabilitySearchInput,
  priceCache?: PriceCache,
): Promise<UnitAvailability[]> {
  const { value: iframe } = await getOrSetCached<ParsedIframe>(
    getIframeCacheKey(hut.id),
    UNITS_TTL_MS,
    () => fetchAndParseIframe(hut),
  );

  const results: UnitAvailability[] = [];
  const queue = [...iframe.units];
  // The worker is deliberately conservative with Bentral; one request at a time.
  const concurrency = 1;

  async function worker() {
    while (queue.length > 0) {
      const unit = queue.shift();

      if (!unit) {
        return;
      }

      results.push(
        await checkUnitAvailability(
          hut,
          iframe.user,
          iframe.unavailableDates,
          unit,
          input,
          priceCache,
        ),
      );
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return iframe.units.map((unit) => {
    const result = results.find((item) => item.bentralUnitId === unit.bentralUnitId);

    return (
      result ?? {
        bentralUnitId: unit.bentralUnitId,
        unitName: unit.name,
        status: "unknown",
        errorMessage: "No result returned for this unit.",
      }
    );
  });
}

export async function checkFirstAvailableUnitAvailability(
  hut: Hut,
  input: AvailabilitySearchInput,
): Promise<UnitAvailability[]> {
  const { value: iframe } = await getOrSetCached<ParsedIframe>(
    getIframeCacheKey(hut.id),
    UNITS_TTL_MS,
    () => fetchAndParseIframe(hut),
  );
  const checkedResults: UnitAvailability[] = [];
  const firstUnit = iframe.units[0];

  if (!firstUnit) {
    return [
      {
        bentralUnitId: "unknown",
        unitName: "Unknown unit",
        status: "unknown",
        errorMessage: "No units parsed for this hut.",
      },
    ];
  }

  for (const unit of iframe.units) {
    const result = await checkUnitAvailability(
      hut,
      iframe.user,
      iframe.unavailableDates,
      unit,
      input,
    );
    checkedResults.push(result);

    if (result.status === "available") {
      break;
    }
  }

  return checkedResults;
}

async function fetchAndParseIframe(hut: Hut): Promise<ParsedIframe> {
  if (process.env.NODE_ENV !== "production") {
    console.info("[bentral] fetching iframe", hut.bentralIframeUrl);
  }

  const startedAt = Date.now();
  let response: Response;
  let requestId: string | null = null;

  try {
    requestId = await beginBentralRequest({
      hutId: hut.id,
      requestType: "iframe",
    });
    response = await fetch(hut.bentralIframeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PZSAvailabilityMVP/0.1)",
      },
      next: { revalidate: 0 },
    });
    await finishBentralRequest({
      id: requestId,
      responseStatus: response.status,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    await finishBentralRequest({
      id: requestId,
      durationMs: Date.now() - startedAt,
      errorMessage: error instanceof Error ? error.message : "Network request failed.",
    });
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Bentral iframe request failed with ${response.status}.`);
  }

  const html = await response.text();
  const parsed = parseIframeHtml(html);

  if (parsed.units.length === 0) {
    throw new Error("No accommodation units were parsed from the Bentral iframe.");
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      "[bentral] parsed units",
      parsed.units.map((unit) => `${unit.bentralUnitId}:${unit.name}`),
    );
  }

  return parsed;
}

export function parseIframeHtml(html: string): ParsedIframe {
  const $ = cheerio.load(html);
  const user = $('input[name="user"]').attr("value") ?? "";
  const unitsFromScript = parseUnitsFromUnitData(html);
  const unavailableDates = parseUnavailableDates(html);

  if (unitsFromScript.length > 0) {
    return { units: unitsFromScript, user, unavailableDates };
  }

  const unitsFromSelect: AccommodationUnit[] = $("select.select-unit option[value]")
    .toArray()
    .flatMap((element) => {
      const option = $(element);
      const bentralUnitId = option.attr("value")?.trim() ?? "";
      const name = option.text().trim();

      if (!bentralUnitId || !name || bentralUnitId === "") {
        return [];
      }

      return [
        {
          bentralUnitId,
          name,
          capacity: numberOrUndefined(option.attr("data-capacity")),
          availableUnitCount: numberOrUndefined(option.attr("data-uts")),
          maxAdults: numberOrUndefined(option.attr("data-adults")),
          maxChildren: numberOrUndefined(option.attr("data-children")),
        },
      ];
    });

  return { units: unitsFromSelect, user, unavailableDates };
}

function parseUnitsFromUnitData(html: string): AccommodationUnit[] {
  const match = html.match(/var\s+unit_data\s*=\s*(\{.*?\});/s);

  if (!match) {
    return [];
  }

  try {
    const data = JSON.parse(match[1]) as Record<
      string,
      {
        title?: string;
        capacity?: unknown;
        uts?: unknown;
        adults?: unknown;
        children?: unknown;
      }
    >;

    return Object.entries(data)
      .map(([bentralUnitId, unit]) => ({
        bentralUnitId,
        name: String(unit.title ?? "").trim(),
        capacity: numberOrUndefined(unit.capacity),
        availableUnitCount: numberOrUndefined(unit.uts),
        maxAdults: numberOrUndefined(unit.adults),
        maxChildren: numberOrUndefined(unit.children),
      }))
      .filter((unit) => unit.bentralUnitId && unit.name);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[bentral] failed to parse unit_data", error);
    }

    return [];
  }
}

function parseUnavailableDates(html: string): UnavailabilityCalendar {
  const match = html.match(/var\s+unavailDates\s*=\s*(\{.*?\});\s*var\s+closedDates/s);

  if (!match) {
    return {};
  }

  try {
    return JSON.parse(match[1]) as UnavailabilityCalendar;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[bentral] failed to parse unavailDates", error);
    }

    return {};
  }
}

async function checkUnitAvailability(
  hut: Hut,
  user: string,
  unavailableDates: UnavailabilityCalendar,
  unit: AccommodationUnit,
  input: AvailabilitySearchInput,
  priceCache?: PriceCache,
): Promise<UnitAvailability> {
  const cacheKey = [
    "availability",
    hut.id,
    unit.bentralUnitId,
    input.arrivalDate,
    input.departureDate,
    input.adults,
    input.children.map((child) => child.age).join(","),
  ].join(":");

  if (
    !isUnitAvailableForStay(
      unavailableDates[unit.bentralUnitId],
      input.arrivalDate,
      input.departureDate,
    )
  ) {
    const result: UnitAvailability = {
      bentralUnitId: unit.bentralUnitId,
      unitName: unit.name,
      status: "unavailable",
      cached: false,
      cachedAt: new Date().toISOString(),
      stale: false,
    };

    return result;
  }

  const durableCached = await priceCache?.get(cacheKey);
  const cached = durableCached ? undefined : getCachedEntry<UnitAvailability>(cacheKey);

  if (durableCached?.status === "available") {
    return { ...durableCached, cached: true, stale: false };
  }

  if (cached?.value.status === "available") {
    return {
      ...cached.value,
      cached: true,
      cachedAt: new Date(cached.createdAt).toISOString(),
      stale: cached.ageMs >= STALE_AFTER_MS,
    };
  }

  try {
    const body = buildAvailabilityBody(hut, user, unit.bentralUnitId, input);
    const startedAt = Date.now();

    if (process.env.NODE_ENV !== "production") {
      console.info("[bentral] availability request", {
        unit: unit.bentralUnitId,
        arrival: input.arrivalDate,
        departure: input.departureDate,
        adults: input.adults,
        children: input.children.length,
      });
    }

    let response: Response;
    let requestId: string | null = null;

    try {
      requestId = await beginBentralRequest({
        hutId: hut.id,
        requestType: "availability",
        unitId: unit.bentralUnitId,
        arrivalDate: input.arrivalDate,
        departureDate: input.departureDate,
      });
      response = await fetch(BENTRAL_AVAILABILITY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Referer: hut.bentralIframeUrl,
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": "Mozilla/5.0 (compatible; PZSAvailabilityMVP/0.1)",
        },
        body,
      });
      await finishBentralRequest({
        id: requestId,
        responseStatus: response.status,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      await finishBentralRequest({
        id: requestId,
        durationMs: Date.now() - startedAt,
        errorMessage: error instanceof Error ? error.message : "Network request failed.",
      });
      throw error;
    }

    const text = await response.text();

    if (process.env.NODE_ENV !== "production") {
      console.info("[bentral] availability response", {
        unit: unit.bentralUnitId,
        status: response.status,
        length: text.length,
      });
    }

    if (!response.ok) {
      throw new Error(`Bentral responded with ${response.status}.`);
    }

    const payload = JSON.parse(text) as BentralAvailabilityPayload;
    const pricing = payload.pricings_available?.[0];
    const result: UnitAvailability = {
      bentralUnitId: unit.bentralUnitId,
      unitName: unit.name,
      status: payload.pricings_available?.length ? "available" : "unknown",
      price: pricing?.amount,
      priceDisplay: pricing?.amount_show,
      cached: false,
      cachedAt: new Date().toISOString(),
      stale: false,
    };

    if (priceCache) {
      await priceCache.put(cacheKey, result);
    } else {
      setCached(cacheKey, result, PRICE_TTL_MS);
    }
    return result;
  } catch (error) {
    const result: UnitAvailability = {
      bentralUnitId: unit.bentralUnitId,
      unitName: unit.name,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown availability error.",
      cached: false,
      cachedAt: new Date().toISOString(),
      stale: false,
    };

    if (!priceCache) {
      setCached(cacheKey, result, FAILED_AVAILABILITY_TTL_MS);
    }
    return result;
  }
}

export function isUnitAvailableForStay(
  calendar: Record<string, UnavailabilityMarker> | undefined,
  arrivalDate: string,
  departureDate: string,
): boolean {
  if (!calendar) {
    return true;
  }

  for (const date of datesInInclusiveRange(arrivalDate, departureDate)) {
    const marker = calendar[date];

    if (marker === "unavail") {
      return false;
    }

    if (marker === "unavail_start" && date !== departureDate) {
      return false;
    }
  }

  return true;
}

function datesInInclusiveRange(arrivalDate: string, departureDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${arrivalDate}T00:00:00.000Z`);
  const departure = new Date(`${departureDate}T00:00:00.000Z`);

  while (current <= departure) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

function getIframeCacheKey(hutId: string) {
  return `iframe:${IFRAME_CACHE_VERSION}:${hutId}`;
}

function buildAvailabilityBody(
  hut: Hut,
  user: string,
  unitId: string,
  input: AvailabilitySearchInput,
): URLSearchParams {
  const params = new URLSearchParams();
  const childrenAges = input.children.map((child) => String(child.age));
  const add = (key: string, value: string | number) => params.append(key, String(value));

  add("building", hut.bentralBuildingId);
  add("key", hut.bentralKey);
  add("lang", "sl");
  add("user", user || "5f7a55324f515f4d");
  add("unit[]", unitId);
  add(`unit_num[${unitId}]`, 1);
  add(`unit_p[${unitId}][adults][0]`, input.adults);
  add(`unit_p[${unitId}][children][0]`, input.children.length);

  for (const age of childrenAges) {
    add(`unit_p[${unitId}][children_age][0][]`, age);
  }

  add("title_source", "web");
  add("formated_arrival", formatBentralDate(input.arrivalDate));
  add("arrival", input.arrivalDate);
  add("departure", input.departureDate);
  add("formated_departure", formatBentralDate(input.departureDate));
  add("bank_cutoff_days", 0);
  add("adults", input.adults);
  add("children", input.children.length);
  add("children_age", childrenAges.join(","));
  add("pet", 0);
  add("pet_desc", "");
  add("name", "");
  add("country", "");
  add("email", "");
  add("phone_number", "");
  add("phone_type", "mobile");
  add("note", "");
  add("arrival_time", -1);
  add("payment", "arrival");

  return params;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
