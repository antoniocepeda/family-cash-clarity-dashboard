import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { advanceCommitment, getCommitment } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { commitment_id, instance_due_date, action } = await req.json();
  if (!commitment_id || !instance_due_date || !action) {
    return NextResponse.json({ error: "commitment_id, instance_due_date, and action required" }, { status: 400 });
  }
  if (action !== "rollover" && action !== "release") {
    return NextResponse.json({ error: "action must be 'rollover' or 'release'" }, { status: 400 });
  }
  const commitment = await getCommitment(user.uid, commitment_id);
  if (!commitment) return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  if (!commitment.recurrence_rule) {
    return NextResponse.json({ error: "Leftover handling only applies to recurring commitments" }, { status: 400 });
  }
  try {
    await advanceCommitment(user.uid, commitment_id, instance_due_date, action === "rollover");
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Leftover operation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = withAuth(handlePOST);
