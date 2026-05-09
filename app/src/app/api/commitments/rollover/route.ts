import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { advanceCommitment } from "@/lib/repositories/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { id, instance_due_date } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await advanceCommitment(user.uid, id, instance_due_date);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rollover failed";
    return NextResponse.json({ error: message }, { status: message === "not found" ? 404 : 400 });
  }
}

export const POST = withAuth(handlePOST);
