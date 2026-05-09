import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";

async function handlePOST(req: NextRequest) {
  const { id, actual_balance } = await req.json();
  if (!id || actual_balance === undefined)
    return NextResponse.json({ error: "id and actual_balance required" }, { status: 400 });

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare("UPDATE accounts SET current_balance = ?, updated_at = ? WHERE id = ?")
    .run(actual_balance, now, id);

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  return NextResponse.json(account);
}

export const POST = withAuth(handlePOST);
