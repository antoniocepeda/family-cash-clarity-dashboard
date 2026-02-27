import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureInstance, advanceByRule } from "@/lib/instances";
import { format, parseISO } from "date-fns";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const { id, actual_amount, instance_due_date, note, account_id: overrideAccountId } = await req.json();
  if (!id || actual_amount === undefined)
    return NextResponse.json(
      { error: "id and actual_amount required" },
      { status: 400 }
    );

  const db = getDb();
  const commitment = db.prepare("SELECT * FROM commitments WHERE id = ?").get(id) as
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

  if (!commitment) return NextResponse.json({ error: "not found" }, { status: 404 });

  const effectiveAccountId = overrideAccountId || commitment.account_id;
  if (!effectiveAccountId) {
    return NextResponse.json(
      { error: "No account linked. Please select an account for this payment." },
      { status: 400 }
    );
  }

  const paidDate = format(new Date(), "yyyy-MM-dd");
  const targetDueDate = instance_due_date || commitment.due_date;

  const run = db.transaction(() => {
    const impact = commitment.type === "income" ? actual_amount : -actual_amount;
    db.prepare(
      "UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(impact, effectiveAccountId);

    db.prepare(
      "INSERT INTO commitment_history (id, commitment_id, amount, actual_amount, paid_date, due_date) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), commitment.id, commitment.amount, actual_amount, paidDate, targetDueDate);

    const ledgerId = randomUUID();
    const ledgerType = commitment.type === "income" ? "income" : "expense";
    const ledgerDesc = note ? `${commitment.name}: ${note}` : commitment.name;
    db.prepare(
      "INSERT INTO ledger (id, date, description, amount, type, account_id, commitment_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(ledgerId, paidDate, ledgerDesc, actual_amount, ledgerType, effectiveAccountId, commitment.id);

    db.prepare(
      "INSERT INTO ledger_items (id, ledger_id, description, amount, commitment_id, instance_due_date) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), ledgerId, note || commitment.name, actual_amount, commitment.id, targetDueDate);

    const instanceId = ensureInstance(db, commitment.id, targetDueDate, commitment.amount);
    const instance = db.prepare("SELECT planned_amount, allocated_amount FROM commitment_instances WHERE id = ?")
      .get(instanceId) as { planned_amount: number; allocated_amount: number };

    const allocationAmount = actual_amount;

    db.prepare(
      "INSERT INTO commitment_allocations (id, ledger_id, instance_id, commitment_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), ledgerId, instanceId, commitment.id, allocationAmount, note || null);

    const newAllocated = instance.allocated_amount + allocationAmount;
    const newStatus = newAllocated >= instance.planned_amount - 0.005 ? "funded" : "open";

    db.prepare(
      "UPDATE commitment_instances SET allocated_amount = ?, status = ? WHERE id = ?"
    ).run(newAllocated, newStatus, instanceId);

    if (commitment.recurrence_rule) {
      if (newStatus === "funded") {
        const base = parseISO(commitment.due_date);
        const next = advanceByRule(base, commitment.recurrence_rule!);
        db.prepare(
          "UPDATE commitments SET due_date = ?, paid = 0, actual_amount = NULL, paid_date = NULL WHERE id = ?"
        ).run(format(next, "yyyy-MM-dd"), id);
      }
    } else {
      if (newStatus === "funded") {
        db.prepare(
          "UPDATE commitments SET paid = 1, actual_amount = ?, paid_date = ? WHERE id = ?"
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
