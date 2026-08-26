import { NextResponse } from "next/server";
import { getStoredWeekAvailability } from "@/lib/availability-store";
import { getAllHuts } from "@/lib/huts";
import { parseAvailabilityInput } from "@/lib/validation";

type WeekAvailabilityRequest = {
  stays?: unknown;
  hutIds?: unknown;
};

export async function POST(request: Request) {
  let body: WeekAvailabilityRequest;

  try {
    body = (await request.json()) as WeekAvailabilityRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!Array.isArray(body.stays) || body.stays.length === 0 || body.stays.length > 31) {
    return NextResponse.json({ error: "Provide between 1 and 31 stays." }, { status: 400 });
  }

  let stays;
  try {
    stays = body.stays.map((stay) => {
      const input = parseAvailabilityInput({ ...stay as object, adults: 1, children: [] });
      return { arrivalDate: input.arrivalDate, departureDate: input.departureDate };
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid stay." },
      { status: 400 },
    );
  }

  const requestedHutIds = Array.isArray(body.hutIds)
    ? body.hutIds.filter((hutId): hutId is string => typeof hutId === "string")
    : [];
  const huts = getAllHuts().filter((hut) => requestedHutIds.includes(hut.id));

  if (huts.length === 0) {
    return NextResponse.json({ error: "No matching huts found." }, { status: 404 });
  }

  const availability = await getStoredWeekAvailability(huts, stays);
  return NextResponse.json({ availability, checkedAt: new Date().toISOString() });
}
