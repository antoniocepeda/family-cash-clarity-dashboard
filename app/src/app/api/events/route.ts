import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function GET() {
  const db = getDb();
  const events = db
    .prepare("SELECT * FROM events WHERE active = 1 ORDER BY due_date ASC")
    .all();
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = uuid();

  db.prepare(
    `INSERT INTO events (id, name, type, amount, due_date, recurrence_rule, priority, autopay, account_id, active, paid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`
  ).run(
    id,
    body.name,
    body.type,
    body.amount,
    body.due_date,
    body.recurrence_rule || null,
    body.priority || "normal",
    body.autopay ? 1 : 0,
    body.account_id || null
  );

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id);
  return NextResponse.json(event, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  db.prepare(
    `UPDATE events SET name = ?, type = ?, amount = ?, due_date = ?, recurrence_rule = ?,
     priority = ?, autopay = ?, account_id = ?, active = ?, paid = ?
     WHERE id = ?`
  ).run(
    body.name,
    body.type,
    body.amount,
    body.due_date,
    body.recurrence_rule || null,
    body.priority || "normal",
    body.autopay ? 1 : 0,
    body.account_id || null,
    body.active ?? 1,
    body.paid ?? 0,
    body.id
  );

  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(body.id);
  return NextResponse.json(event);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  db.prepare("DELETE FROM events WHERE id = ?").run(id);
  return NextResponse.json({ success: true });
}
