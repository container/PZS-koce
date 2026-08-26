import { NextResponse } from "next/server";
import { getStoredSummary } from "@/lib/availability-store";
import { getAllHuts } from "@/lib/huts";
import { parseAvailabilityInput } from "@/lib/validation";
import type { MultiHutAvailabilityResponse } from "@/types/availability";

export async function POST(request: Request) {
  let body: unknown;
  let input;

  try {
    body = await request.json();
    input = parseAvailabilityInput(body);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const requestedHutIds =
    body &&
    typeof body === "object" &&
    "hutIds" in body &&
    Array.isArray((body as { hutIds?: unknown }).hutIds)
      ? (body as { hutIds: unknown[] }).hutIds.filter(
          (hutId): hutId is string => typeof hutId === "string",
        )
      : [];
  const mode =
    body &&
    typeof body === "object" &&
    "mode" in body &&
    (body as { mode?: unknown }).mode === "full"
      ? "full"
      : "quick";

  const allHuts = getAllHuts();
  const huts =
    requestedHutIds.length > 0
      ? allHuts.filter((hut) => requestedHutIds.includes(hut.id))
      : allHuts;

  if (huts.length === 0) {
    return NextResponse.json({ error: "No matching huts found." }, { status: 404 });
  }

  // This route intentionally never contacts Bentral. Missing/stale records enqueue a
  // deduplicated job and return the last durable snapshot immediately.
  const hutResults = await Promise.all(huts.map((hut) => getStoredSummary(hut, input)));
  const response: MultiHutAvailabilityResponse = {
    arrivalDate: input.arrivalDate,
    departureDate: input.departureDate,
    adults: input.adults,
    children: input.children,
    checkedAt: new Date().toISOString(),
    huts: hutResults,
  };

  return NextResponse.json(response);
}
