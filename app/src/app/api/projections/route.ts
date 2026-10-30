import { NextRequest, NextResponse } from "next/server";
import { withPublicRead } from "@/lib/auth";
import { generateProjection } from "@/lib/projection";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { searchParams } = new URL(req.url);
  const requested = parseInt(searchParams.get("days") || "28", 10);
  const days = Number.isFinite(requested) ? Math.min(400, Math.max(1, requested)) : 28;
  const simulateEarlyIds = searchParams.get("simulate_early")?.split(",").filter(Boolean) ?? [];
  const includePending = searchParams.get("include_pending") === "1";
  return NextResponse.json(await generateProjection(user.uid, days, simulateEarlyIds, includePending));
}

export const GET = withPublicRead(handleGET);
