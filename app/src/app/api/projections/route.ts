import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { generateProjection } from "@/lib/projection";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "28", 10);
  const simulateEarlyIds = searchParams.get("simulate_early")?.split(",").filter(Boolean) ?? [];
  const includePending = searchParams.get("include_pending") === "1";
  return NextResponse.json(await generateProjection(user.uid, days, simulateEarlyIds, includePending));
}

export const GET = withAuth(handleGET);
