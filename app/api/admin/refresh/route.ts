import { NextResponse } from "next/server";
import { calendarJobKey, enqueueJob, priceJobKey, unitsJobKey } from "@/lib/calendar-store";
import { pool } from "@/lib/db";
import { getAllHuts } from "@/lib/huts";

type RefreshAction = "calendars" | "units" | "prices";

export async function POST(request: Request) {
  let action: RefreshAction;
  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== "calendars" && body.action !== "units" && body.action !== "prices") {
      return NextResponse.json({ error: "Unknown refresh action." }, { status: 400 });
    }
    action = body.action;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (action === "prices") {
    const { rows } = await pool.query<{ hut_id: string; unit_id: string }>(
      "SELECT hut_id, unit_id FROM bentral_units",
    );
    await Promise.all(rows.map((row) => enqueueJob(priceJobKey(row.hut_id, row.unit_id), row.hut_id, true)));
    return NextResponse.json({ queued: rows.length, action });
  }

  const huts = getAllHuts();
  await Promise.all(huts.map((hut) => enqueueJob(
    action === "units" ? unitsJobKey(hut.id) : calendarJobKey(hut.id),
    hut.id,
    true,
  )));
  return NextResponse.json({ queued: huts.length, action });
}
