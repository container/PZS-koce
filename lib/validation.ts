import type { AvailabilitySearchInput } from "@/types/availability";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseAvailabilityInput(body: unknown): AvailabilitySearchInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }

  const input = body as Partial<AvailabilitySearchInput>;
  const arrivalDate = String(input.arrivalDate ?? "");
  const departureDate = String(input.departureDate ?? "");

  if (!datePattern.test(arrivalDate)) {
    throw new Error("Arrival date is required in YYYY-MM-DD format.");
  }

  if (!datePattern.test(departureDate)) {
    throw new Error("Departure date is required in YYYY-MM-DD format.");
  }

  if (new Date(`${departureDate}T00:00:00Z`) <= new Date(`${arrivalDate}T00:00:00Z`)) {
    throw new Error("Departure date must be after arrival date.");
  }

  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const horizonEnd = new Date(todayUtc);
  horizonEnd.setUTCMonth(horizonEnd.getUTCMonth() + 3);
  const arrival = new Date(`${arrivalDate}T00:00:00Z`);
  const departure = new Date(`${departureDate}T00:00:00Z`);

  if (arrival < todayUtc) {
    throw new Error("Arrival date cannot be in the past.");
  }

  if (departure > horizonEnd) {
    throw new Error("Dates can be searched up to three months ahead.");
  }

  return {
    arrivalDate,
    departureDate,
    adults: 1,
    children: [],
  };
}

export function formatBentralDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}
