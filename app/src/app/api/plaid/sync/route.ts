import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { parsePlaidSyncQuery, PlaidRequestError } from "@/lib/plaid-link";
import { PlaidItemNotFoundError, syncPlaidForUser } from "@/lib/plaid-sync";
import { ensureUser, getPlaidStatus } from "@/lib/repositories/firestore";
import { runHouseholdUpkeep } from "@/lib/upkeep";
import type { DecodedIdToken } from "firebase-admin/auth";

async function handleGET(_req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);
  return NextResponse.json(await getPlaidStatus(user.uid));
}

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  await ensureUser(user.uid, user.email);

  let options;
  try {
    options = parsePlaidSyncQuery(new URL(req.url).searchParams);
  } catch (err) {
    if (err instanceof PlaidRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let summary;
  try {
    summary = await syncPlaidForUser(user.uid, options);
  } catch (err) {
    if (err instanceof PlaidItemNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    throw err;
  }

  try {
    await runHouseholdUpkeep(user.uid);
  } catch (err) {
    console.error("Post-sync reconcile failed:", err instanceof Error ? err.message : "unknown error");
  }
  return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
}

export const GET = withAuth(handleGET);
export const POST = withAuth(handlePOST);
