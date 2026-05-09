import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createLedger, listLedger } from "@/lib/repositories/firestore";
import { AllocationInput } from "@/lib/types";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  return NextResponse.json(await listLedger(user.uid));
}

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { description, amount, type, account_id, allocations, items } = await req.json();
  if (!description || amount === undefined || !type || !account_id) {
    return NextResponse.json({ error: "description, amount, type, and account_id required" }, { status: 400 });
  }
  const allocs: AllocationInput[] = allocations || [];
  if (allocs.length > 0) {
    const allocTotal = allocs.reduce((s, a) => s + a.amount, 0);
    if (Math.abs(allocTotal - amount) > 0.005) {
      return NextResponse.json(
        { error: `Allocation total ($${allocTotal.toFixed(2)}) must equal transaction amount ($${amount.toFixed(2)})` },
        { status: 400 }
      );
    }
    if (allocs.some((a) => a.amount <= 0)) {
      return NextResponse.json({ error: "Each allocation amount must be greater than 0" }, { status: 400 });
    }
  }
  try {
    const id = await createLedger(user.uid, { description, amount, type, account_id, allocations: allocs, items: items || [] });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transaction failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
