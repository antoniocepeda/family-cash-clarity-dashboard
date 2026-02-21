import { NextRequest, NextResponse } from "next/server";
import { generateProjection } from "@/lib/projection";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "28", 10);
  const simulateEarly = searchParams.get("simulate_early");
  const simulateEarlyIds = simulateEarly ? simulateEarly.split(",").filter(Boolean) : [];
  const projection = generateProjection(days, simulateEarlyIds);
  return NextResponse.json(projection);
}
