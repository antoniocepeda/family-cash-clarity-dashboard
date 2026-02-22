import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEligibleInstances, ensureInstance } from "@/lib/instances";

export async function GET() {
  const db = getDb();
  const instances = getEligibleInstances(db);
  return NextResponse.json(instances);
}

export async function PATCH(req: NextRequest) {
  const { event_id, due_date, planned_amount } = await req.json();
  if (!event_id || !due_date || planned_amount === undefined) {
    return NextResponse.json(
      { error: "event_id, due_date, and planned_amount required" },
      { status: 400 }
    );
  }
  if (typeof planned_amount !== "number" || planned_amount < 0) {
    return NextResponse.json(
      { error: "planned_amount must be a non-negative number" },
      { status: 400 }
    );
  }

  const db = getDb();
  const event = db.prepare("SELECT amount FROM events WHERE id = ?").get(event_id) as { amount: number } | undefined;
  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const instanceId = ensureInstance(db, event_id, due_date, event.amount);

  const instance = db
    .prepare("SELECT allocated_amount FROM event_instances WHERE id = ?")
    .get(instanceId) as { allocated_amount: number };

  const newStatus = instance.allocated_amount >= planned_amount - 0.005 ? "funded" : "open";

  db.prepare(
    "UPDATE event_instances SET planned_amount = ?, status = ? WHERE id = ?"
  ).run(planned_amount, newStatus, instanceId);

  return NextResponse.json({ success: true });
}
