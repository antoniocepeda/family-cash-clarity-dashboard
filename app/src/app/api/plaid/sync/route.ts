import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { syncPlaidForUser } from "@/lib/plaid-sync";
import { ensureUser, getPlaidStatus } from "@/lib/repositories/firestore";
import { runHouseholdUpkeep } from "@/lib/upkeep";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  return NextResponse.json(await getPlaidStatus(user.uid));
}

async function handlePOST(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  const summary = await syncPlaidForUser(user.uid);
  try {
    await runHouseholdUpkeep(user.uid);
  } catch (err) {
    console.error("Post-sync reconcile failed:", err instanceof Error ? err.message : "unknown error");
  }
  return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
