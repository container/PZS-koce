import { NextResponse } from "next/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    hutId: string;
  }>;
};

export async function GET(_request: Request, _context: RouteContext) {
  return NextResponse.json({ error: "Units are populated only by an availability refresh; use the availability endpoint." }, { status: 410 });
}
