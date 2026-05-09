import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { deleteLedger, updateLedger } from "@/lib/repositories/firestore";
import { AllocationInput } from "@/lib/types";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePATCH(
  req: NextRequest,
  { params, user }: { params: Promise<{ id: string }>; user: DecodedIdToken }
) {
  const { id } = await params;
  const body = await req.json();
  const allocs: AllocationInput[] | undefined = body.allocations;
  const newAmount = body.amount;

  if (allocs && allocs.length > 0) {
    const allocTotal = allocs.reduce((s, a) => s + a.amount, 0);
    if (newAmount !== undefined && Math.abs(allocTotal - newAmount) > 0.005) {
      return NextResponse.json({ error: "Allocation total must equal transaction amount" }, { status: 400 });
    }
    if (allocs.some((a) => a.amount <= 0)) {
      return NextResponse.json({ error: "Each allocation amount must be greater than 0" }, { status: 400 });
    }
  }

  try {
    const ok = await updateLedger(user.uid, id, body);
    if (!ok) return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function handleDELETE(
  _req: NextRequest,
  { params, user }: { params: Promise<{ id: string }>; user: DecodedIdToken }
) {
  const { id } = await params;
  try {
    const ok = await deleteLedger(user.uid, id);
    if (!ok) return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const PATCH = withAuth<{ params: Promise<{ id: string }> }>(handlePATCH);
export const DELETE = withAuth<{ params: Promise<{ id: string }> }>(handleDELETE);
