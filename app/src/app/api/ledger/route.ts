import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { format } from "date-fns";

export async function GET() {
  const db = getDb();
  const entries = db
    .prepare("SELECT * FROM ledger ORDER BY date DESC, created_at DESC")
    .all();
  return NextResponse.json(entries);
}

export async function POST(req: NextRequest) {
  const { description, amount, type, account_id } = await req.json();
  if (!description || amount === undefined || !type || !account_id) {
    return NextResponse.json(
      { error: "description, amount, type, and account_id required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = randomUUID();
  const date = format(new Date(), "yyyy-MM-dd");

  db.prepare(
    "INSERT INTO ledger (id, date, description, amount, type, account_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, date, description, amount, type, account_id);

  const impact = type === "income" ? amount : -amount;
  db.prepare(
    "UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?"
  ).run(impact, account_id);

  return NextResponse.json({ success: true, id });
}
