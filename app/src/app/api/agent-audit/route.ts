import { NextRequest, NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { withAuth } from "@/lib/auth";
import { listAgentAudit } from "@/lib/repositories/firestore";

async function handleGET(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const rawLimit = Number(new URL(req.url).searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 20;
  return NextResponse.json(await listAgentAudit(user.uid, limit));
}

export const GET = withAuth(handleGET, { allowAgent: true });
