import { NextResponse } from "next/server";
import { getStoredSummary } from "@/lib/availability-store";
import { getHut } from "@/lib/huts";
import { parseAvailabilityInput } from "@/lib/validation";
import type { AvailabilityResponse } from "@/types/availability";

type RouteContext = {
  params: Promise<{
    hutId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { hutId } = await context.params;
  const hut = getHut(hutId);

  if (!hut) {
    return NextResponse.json({ error: "Hut not found." }, { status: 404 });
  }

  let input;

  try {
    input = parseAvailabilityInput(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const summary = await getStoredSummary(hut, input);
  const response: AvailabilityResponse = {
    hutId: hut.id, hutName: hut.name, arrivalDate: input.arrivalDate,
    departureDate: input.departureDate, adults: input.adults, children: input.children,
    results: summary.results, checkedAt: summary.checkedAt,
    stale: summary.stale, refreshPending: summary.status === "pending" || summary.stale,
    sourceUrl: summary.sourceUrl,
  };
  return NextResponse.json(response);
}
