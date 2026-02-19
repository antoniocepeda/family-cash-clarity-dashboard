import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
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
