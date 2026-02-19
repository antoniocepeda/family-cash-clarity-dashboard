import { NextRequest, NextResponse } from "next/server";
import { generateProjection } from "@/lib/projection";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "28", 10);
  const projection = generateProjection(days);
  return NextResponse.json(projection);
}
