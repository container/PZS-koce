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
    const { rows } = await pool.query<{ arrival_date: string }>(
      `SELECT DISTINCT arrival_date::text FROM availability_snapshots
       WHERE arrival_date = ANY($1::date[]) AND expires_at > now()`,
      [dates],
    );
    return NextResponse.json({ dates: rows.map((row) => row.arrival_date) });
  } catch {
    return NextResponse.json({ dates: [] });
  }
}
