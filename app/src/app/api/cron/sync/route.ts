import { NextRequest, NextResponse } from "next/server";
import { authorizeScheduler } from "@/lib/auth";
import { syncPlaidForUser } from "@/lib/plaid-sync";
import { ensureUser } from "@/lib/repositories/firestore";
import { runHouseholdUpkeep } from "@/lib/upkeep";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await authorizeScheduler(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureUser(user.uid, user.email);
  let sync = null;
  let syncError: string | null = null;
  try {
    sync = await syncPlaidForUser(user.uid);
  } catch (err) {
    syncError = err instanceof Error ? err.message : "Plaid sync failed";
  }

  try {
    const upkeep = await runHouseholdUpkeep(user.uid);
    return NextResponse.json({
      sync,
      sync_error: syncError,
      materialized: upkeep.materialized,
      matched: upkeep.matched,
      prompts: upkeep.prompts.length,
    }, { status: syncError || sync?.errors.length ? 207 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upkeep failed";
    return NextResponse.json({ sync, sync_error: syncError, error: message }, { status: 500 });
  }
}
