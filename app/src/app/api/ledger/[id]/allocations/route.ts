import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { updateLedgerAllocations } from "@/lib/repositories/firestore";
import { AllocationInput } from "@/lib/types";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePATCH(
  req: NextRequest,
  { params, user }: { params: Promise<{ id: string }>; user: DecodedIdToken }
) {
  const { id } = await params;
  const body = await req.json();
  const allocations: AllocationInput[] = body.allocations ?? [];

  if (!Array.isArray(allocations)) {
    return NextResponse.json({ error: "allocations must be an array" }, { status: 400 });
  }

  if (
    allocations.some(
      (a) => !a.commitment_id || !a.instance_due_date || typeof a.amount !== "number" || a.amount <= 0
    )
  ) {
    return NextResponse.json(
      { error: "Each allocation requires commitment_id, instance_due_date, and a positive amount" },
      { status: 400 }
    );
  }

  try {
    const ok = await updateLedgerAllocations(user.uid, id, allocations);
    if (!ok) return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Allocation update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(handlePATCH);
