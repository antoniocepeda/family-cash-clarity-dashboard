import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { generateProjection } from "@/lib/projection";

async function handleGET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "28", 10);
  const simulateEarly = searchParams.get("simulate_early");
  const simulateEarlyIds = simulateEarly ? simulateEarly.split(",").filter(Boolean) : [];
  const projection = generateProjection(days, simulateEarlyIds);
  return NextResponse.json(projection);
}

export const GET = withAuth(handleGET);
