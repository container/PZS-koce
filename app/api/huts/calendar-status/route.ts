import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(request: Request) {
  let dates: string[];
  try {
    const body = await request.json() as { dates?: unknown };
    dates = Array.isArray(body.dates)
      ? body.dates.filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)).slice(0, 93)
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!dates.length) return NextResponse.json({ dates: [] });
  try {
    const { rows } = await pool.query<{ date: string }>(
      `SELECT requested.date::text
       FROM unnest($1::date[]) AS requested(date)
       WHERE EXISTS (
         SELECT 1 FROM bentral_calendars
         WHERE expires_at > now()
           AND requested.date BETWEEN horizon_start AND horizon_end
       )`,
      [dates],
    );
    return NextResponse.json({ dates: rows.map((row) => row.date) });
  } catch {
    return NextResponse.json({ dates: [] });
  }
}
