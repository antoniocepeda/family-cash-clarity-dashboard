import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureInstance } from "@/lib/instances";
import { addDays, addWeeks, addMonths, format, parseISO } from "date-fns";

export async function POST(req: NextRequest) {
  const { commitment_id, instance_due_date, action } = await req.json();

  if (!commitment_id || !instance_due_date || !action) {
    return NextResponse.json(
      { error: "commitment_id, instance_due_date, and action required" },
      { status: 400 }
    );
  }
  if (action !== "rollover" && action !== "release") {
    return NextResponse.json(
      { error: "action must be 'rollover' or 'release'" },
      { status: 400 }
    );
  }

  const db = getDb();
  const commitment = db.prepare("SELECT * FROM commitments WHERE id = ?").get(commitment_id) as
    | {
        id: string;
        name: string;
        amount: number;
        due_date: string;
        recurrence_rule: string | null;
        account_id: string | null;
        type: string;
      }
    | undefined;

  if (!commitment) {
    return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
  }
  if (!commitment.recurrence_rule) {
    return NextResponse.json(
      { error: "Leftover handling only applies to recurring commitments" },
      { status: 400 }
    );
  }

  const run = db.transaction(() => {
    const instanceId = ensureInstance(db, commitment.id, instance_due_date, commitment.amount);

    const instance = db
      .prepare("SELECT planned_amount, allocated_amount FROM commitment_instances WHERE id = ?")
      .get(instanceId) as { planned_amount: number; allocated_amount: number };

    const leftover = instance.planned_amount - instance.allocated_amount;

    db.prepare("UPDATE commitment_instances SET status = 'funded' WHERE id = ?").run(instanceId);

    const base = parseISO(commitment.due_date);
    let next: Date;
    switch (commitment.recurrence_rule) {
      case "weekly":
        next = addDays(base, 7);
        break;
      case "biweekly":
        next = addWeeks(base, 2);
        break;
      case "monthly":
        next = addMonths(base, 1);
        break;
      case "quarterly":
        next = addMonths(base, 3);
        break;
      case "annual":
        next = addMonths(base, 12);
        break;
      default:
        next = addMonths(base, 1);
        break;
    }

    const nextDateStr = format(next, "yyyy-MM-dd");

    if (action === "rollover" && leftover > 0.005) {
      const nextInstanceId = ensureInstance(db, commitment.id, nextDateStr, commitment.amount);
      const nextInstance = db
        .prepare("SELECT planned_amount FROM commitment_instances WHERE id = ?")
        .get(nextInstanceId) as { planned_amount: number };

      db.prepare(
        "UPDATE commitment_instances SET planned_amount = ? WHERE id = ?"
      ).run(nextInstance.planned_amount + leftover, nextInstanceId);
    }

    db.prepare(
      "UPDATE commitments SET due_date = ?, paid = 0, actual_amount = NULL, paid_date = NULL WHERE id = ?"
    ).run(nextDateStr, commitment.id);
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Leftover operation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
