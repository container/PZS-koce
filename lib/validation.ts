import type { AvailabilitySearchInput } from "@/types/availability";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseAvailabilityInput(body: unknown): AvailabilitySearchInput {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required.");
  }

  const input = body as Partial<AvailabilitySearchInput>;
  const arrivalDate = String(input.arrivalDate ?? "");
  const departureDate = String(input.departureDate ?? "");
  const adults = Number(input.adults);
  const children = Array.isArray(input.children) ? input.children : [];

  if (!datePattern.test(arrivalDate)) {
    throw new Error("Arrival date is required in YYYY-MM-DD format.");
  }

  if (!datePattern.test(departureDate)) {
    throw new Error("Departure date is required in YYYY-MM-DD format.");
  }

  if (new Date(`${departureDate}T00:00:00Z`) <= new Date(`${arrivalDate}T00:00:00Z`)) {
    throw new Error("Departure date must be after arrival date.");
  }

  if (!Number.isInteger(adults) || adults < 1) {
    throw new Error("Adults must be at least 1.");
  }

  const normalizedChildren = children.map((child, index) => {
    const age = Number(child?.age);

    if (!Number.isInteger(age) || age < 0 || age > 17) {
      throw new Error(`Child ${index + 1} must have an age between 0 and 17.`);
    }

    return { age };
  });

  return {
    arrivalDate,
    departureDate,
    adults,
    children: normalizedChildren,
  };
}

export function formatBentralDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}
