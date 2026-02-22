import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllInstancesForEvents } from "@/lib/instances";
import { CashEvent, EventInstance } from "@/lib/types";
import { addDays, startOfDay } from "date-fns";
import { v4 as uuid } from "uuid";

export async function GET() {
  const db = getDb();
  const events = db
    .prepare("SELECT * FROM events WHERE active = 1 ORDER BY due_date ASC")
    .all() as CashEvent[];

  const windowEnd = addDays(startOfDay(new Date()), 28);
  const allInstances = getAllInstancesForEvents(db, windowEnd);

  const instanceMap = new Map<string, EventInstance[]>();
  for (const inst of allInstances) {
    const arr = instanceMap.get(inst.event_id) || [];
    arr.push(inst);
    instanceMap.set(inst.event_id, arr);
  }

  const enriched = events.map((e) => ({
    ...e,
    instances: instanceMap.get(e.id) || [],
  }));

  return NextResponse.json(enriched);
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
