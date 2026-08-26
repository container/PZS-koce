import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Units are populated only by an availability refresh; use the availability endpoint." }, { status: 410 });
}
