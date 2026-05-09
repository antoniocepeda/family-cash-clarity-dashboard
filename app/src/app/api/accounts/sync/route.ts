import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { syncAccountBalance } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { id, actual_balance } = await req.json();
  if (!id || actual_balance === undefined)
    return NextResponse.json({ error: "id and actual_balance required" }, { status: 400 });
  return NextResponse.json(await syncAccountBalance(user.uid, id, Number(actual_balance)));
}

export const POST = withAuth(handlePOST);
