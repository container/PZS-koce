import { NextResponse } from "next/server";
import { getAllHuts, getRegions } from "@/lib/huts";

export async function GET() {
  return NextResponse.json({
    huts: getAllHuts(),
    regions: getRegions(),
  });
}
