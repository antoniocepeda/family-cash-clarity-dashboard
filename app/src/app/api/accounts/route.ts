import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function GET() {
  const db = getDb();
  const accounts = db.prepare("SELECT * FROM accounts ORDER BY name").all();
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO accounts (id, name, type, current_balance, is_reserve, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, body.name, body.type, body.current_balance ?? 0, body.is_reserve ? 1 : 0, now);

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  return NextResponse.json(account, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE accounts SET name = ?, type = ?, current_balance = ?, is_reserve = ?, updated_at = ?
     WHERE id = ?`
  ).run(body.name, body.type, body.current_balance, body.is_reserve ? 1 : 0, now, body.id);

  const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(body.id);
  return NextResponse.json(account);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();

  const run = db.transaction(() => {
    db.prepare("UPDATE commitments SET account_id = NULL WHERE account_id = ?").run(id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
