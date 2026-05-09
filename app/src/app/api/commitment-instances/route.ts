import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getEligibleInstances } from "@/lib/instances";
import { updateInstancePlan } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  return NextResponse.json(await getEligibleInstances(user.uid));
}

async function handlePATCH(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { commitment_id, due_date, planned_amount } = await req.json();
  if (!commitment_id || !due_date || planned_amount === undefined) {
    return NextResponse.json({ error: "commitment_id, due_date, and planned_amount required" }, { status: 400 });
  }
  if (typeof planned_amount !== "number" || planned_amount < 0) {
    return NextResponse.json({ error: "planned_amount must be a non-negative number" }, { status: 400 });
  }
  try {
    await updateInstancePlan(user.uid, commitment_id, due_date, planned_amount);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: message === "Commitment not found" ? 404 : 400 });
  }
}

export const GET = withAuth(handleGET);
export const PATCH = withAuth(handlePATCH);
