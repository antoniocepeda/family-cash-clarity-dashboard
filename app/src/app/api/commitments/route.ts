import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAllInstancesForCommitments } from "@/lib/instances";
import { Commitment, CommitmentInstance } from "@/lib/types";
import { addDays, startOfDay } from "date-fns";
import { v4 as uuid } from "uuid";

export async function GET() {
  const db = getDb();
  const commitments = db
    .prepare("SELECT * FROM commitments WHERE active = 1 ORDER BY due_date ASC")
    .all() as Commitment[];

  const windowEnd = addDays(startOfDay(new Date()), 28);
  const allInstances = getAllInstancesForCommitments(db, windowEnd);

  const instanceMap = new Map<string, CommitmentInstance[]>();
  for (const inst of allInstances) {
    const arr = instanceMap.get(inst.commitment_id) || [];
    arr.push(inst);
    instanceMap.set(inst.commitment_id, arr);
  }

  const enriched = commitments.map((c) => ({
    ...c,
    instances: instanceMap.get(c.id) || [],
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const id = uuid();

  db.prepare(
    `INSERT INTO commitments (id, name, type, amount, due_date, recurrence_rule, priority, autopay, account_id, active, paid)
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

  const commitment = db.prepare("SELECT * FROM commitments WHERE id = ?").get(id);
  return NextResponse.json(commitment, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const db = getDb();

  db.prepare(
    `UPDATE commitments SET name = ?, type = ?, amount = ?, due_date = ?, recurrence_rule = ?,
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

  const commitment = db.prepare("SELECT * FROM commitments WHERE id = ?").get(body.id);
  return NextResponse.json(commitment);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();

  function safeRun(sql: string, params: unknown[]) {
    try { db.prepare(sql).run(...params); } catch { /* column may not exist yet */ }
  }

  const run = db.transaction(() => {
    safeRun("DELETE FROM commitment_allocations WHERE commitment_id = ?", [id]);
    safeRun("DELETE FROM commitment_instances WHERE commitment_id = ?", [id]);
    safeRun("DELETE FROM commitment_history WHERE commitment_id = ?", [id]);
    safeRun("UPDATE ledger SET commitment_id = NULL WHERE commitment_id = ?", [id]);
    safeRun("UPDATE alerts SET commitment_id = NULL WHERE commitment_id = ?", [id]);
    // Also handle legacy column names from old schema
    safeRun("DELETE FROM event_allocations WHERE event_id = ?", [id]);
    safeRun("DELETE FROM event_instances WHERE event_id = ?", [id]);
    safeRun("DELETE FROM event_history WHERE event_id = ?", [id]);
    safeRun("UPDATE ledger SET event_id = NULL WHERE event_id = ?", [id]);
    safeRun("UPDATE alerts SET event_id = NULL WHERE event_id = ?", [id]);
    db.prepare("DELETE FROM commitments WHERE id = ?").run(id);
  });

  try {
    run();
  } catch (err: unknown) {
    // If commitments table also uses old name, try that
    try {
      db.prepare("DELETE FROM events WHERE id = ?").run(id);
      return NextResponse.json({ success: true });
    } catch { /* fall through */ }
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
