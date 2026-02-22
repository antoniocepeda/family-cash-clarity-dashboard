import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureInstance } from "@/lib/instances";
import { addDays, addWeeks, addMonths, format, parseISO } from "date-fns";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const { id, actual_amount, instance_due_date, note } = await req.json();
  if (!id || actual_amount === undefined)
    return NextResponse.json(
      { error: "id and actual_amount required" },
      { status: 400 }
    );

  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as
    | {
        id: string;
        name: string;
        recurrence_rule: string | null;
        due_date: string;
        amount: number;
        account_id: string | null;
        type: string;
      }
    | undefined;

  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const paidDate = format(new Date(), "yyyy-MM-dd");
  const targetDueDate = instance_due_date || event.due_date;

  const run = db.transaction(() => {
    if (event.account_id) {
      const impact = event.type === "income" ? actual_amount : -actual_amount;
      db.prepare(
        "UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(impact, event.account_id);
    }

    db.prepare(
      "INSERT INTO event_history (id, event_id, amount, actual_amount, paid_date, due_date) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), event.id, event.amount, actual_amount, paidDate, targetDueDate);

    const ledgerId = randomUUID();
    if (event.account_id) {
      const ledgerType = event.type === "income" ? "income" : "expense";
      const ledgerDesc = note ? `${event.name}: ${note}` : event.name;
      db.prepare(
        "INSERT INTO ledger (id, date, description, amount, type, account_id, event_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).run(ledgerId, paidDate, ledgerDesc, actual_amount, ledgerType, event.account_id, event.id);
    }

    const instanceId = ensureInstance(db, event.id, targetDueDate, event.amount);
    const instance = db.prepare("SELECT planned_amount, allocated_amount FROM event_instances WHERE id = ?")
      .get(instanceId) as { planned_amount: number; allocated_amount: number };

    const allocationAmount = actual_amount;

    if (event.account_id) {
      db.prepare(
        "INSERT INTO event_allocations (id, ledger_id, instance_id, event_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), ledgerId, instanceId, event.id, allocationAmount, note || null);
    }

    const newAllocated = instance.allocated_amount + allocationAmount;
    const newStatus = newAllocated >= instance.planned_amount - 0.005 ? "funded" : "open";

    db.prepare(
      "UPDATE event_instances SET allocated_amount = ?, status = ? WHERE id = ?"
    ).run(newAllocated, newStatus, instanceId);

    if (event.recurrence_rule) {
      if (newStatus === "funded") {
        const base = parseISO(event.due_date);
        let next: Date;
        switch (event.recurrence_rule) {
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
        db.prepare(
          "UPDATE events SET due_date = ?, paid = 0, actual_amount = NULL, paid_date = NULL WHERE id = ?"
        ).run(format(next, "yyyy-MM-dd"), id);
      }
    } else {
      if (newStatus === "funded") {
        db.prepare(
          "UPDATE events SET paid = 1, actual_amount = ?, paid_date = ? WHERE id = ?"
        ).run(actual_amount, paidDate, id);
      }
    }
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Payment failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
