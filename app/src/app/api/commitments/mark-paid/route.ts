import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { markCommitmentPaid } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { id, actual_amount, instance_due_date, note, account_id } = await req.json();
  if (!id || actual_amount === undefined) {
    return NextResponse.json({ error: "id and actual_amount required" }, { status: 400 });
  }
  try {
    await markCommitmentPaid(user.uid, id, Number(actual_amount), instance_due_date, note, account_id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ error: message }, { status: message === "not found" ? 404 : 400 });
  }
}

export const POST = withAuth(handlePOST);
