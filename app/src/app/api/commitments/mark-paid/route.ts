import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { markCommitmentPaid, markInstancePaidElsewhere } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { id, actual_amount, instance_due_date, instance_id, note, account_id, paid_elsewhere } = await req.json();
  if (paid_elsewhere) {
    const instanceId = typeof instance_id === "string" ? instance_id.trim() : "";
    if (!instanceId && (!id || !instance_due_date)) {
      return NextResponse.json({ error: "instance_id, or id and instance_due_date, required" }, { status: 400 });
    }
    try {
      await markInstancePaidElsewhere(user.uid, {
        instanceId: instanceId || undefined,
        commitmentId: typeof id === "string" ? id : undefined,
        dueDate: typeof instance_due_date === "string" ? instance_due_date : undefined,
      });
      return NextResponse.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Payment failed";
      return NextResponse.json({ error: message }, { status: message === "not found" ? 404 : 400 });
    }
  }
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

export const POST = withAuth(handlePOST, { allowAgent: true });
