import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureInstance } from "@/lib/instances";
import { AllocationInput, LedgerItemInput } from "@/lib/types";
import { randomUUID } from "crypto";
import { format } from "date-fns";

export async function GET() {
  const db = getDb();
  const entries = db
    .prepare("SELECT * FROM ledger ORDER BY date DESC, created_at DESC")
    .all();

  const allAllocations = db
    .prepare(
      `SELECT ca.*, c.name as commitment_name
       FROM commitment_allocations ca
       JOIN commitments c ON c.id = ca.commitment_id`
    )
    .all() as { ledger_id: string; id: string; instance_id: string; commitment_id: string; amount: number; commitment_name: string }[];

  const allocsByLedger = new Map<string, typeof allAllocations>();
  for (const a of allAllocations) {
    const arr = allocsByLedger.get(a.ledger_id) || [];
    arr.push(a);
    allocsByLedger.set(a.ledger_id, arr);
  }

  const allItems = db
    .prepare(
      `SELECT li.*, c.name as commitment_name
       FROM ledger_items li
       LEFT JOIN commitments c ON c.id = li.commitment_id`
    )
    .all() as { ledger_id: string; id: string; description: string; amount: number; commitment_id: string | null; instance_due_date: string | null; commitment_name: string | null }[];

  const itemsByLedger = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByLedger.get(item.ledger_id) || [];
    arr.push(item);
    itemsByLedger.set(item.ledger_id, arr);
  }

  const enriched = (entries as { id: string }[]).map((e) => ({
    ...e,
    allocations: allocsByLedger.get(e.id) || [],
    items: itemsByLedger.get(e.id) || [],
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const { description, amount, type, account_id, allocations, items } = await req.json();
  if (!description || amount === undefined || !type || !account_id) {
    return NextResponse.json(
      { error: "description, amount, type, and account_id required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const allocs: AllocationInput[] = allocations || [];
  const lineItems: LedgerItemInput[] = items || [];

  if (allocs.length > 0) {
    const allocTotal = allocs.reduce((s: number, a: AllocationInput) => s + a.amount, 0);
    if (Math.abs(allocTotal - amount) > 0.005) {
      return NextResponse.json(
        { error: `Allocation total ($${allocTotal.toFixed(2)}) must equal transaction amount ($${amount.toFixed(2)})` },
        { status: 400 }
      );
    }
    for (const a of allocs) {
      if (a.amount <= 0) {
        return NextResponse.json(
          { error: "Each allocation amount must be greater than 0" },
          { status: 400 }
        );
      }
    }
  }

  const id = randomUUID();
  const date = format(new Date(), "yyyy-MM-dd");

  const run = db.transaction(() => {
    db.prepare(
      "INSERT INTO ledger (id, date, description, amount, type, account_id) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, date, description, amount, type, account_id);

    const impact = type === "income" ? amount : -amount;
    db.prepare(
      "UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(impact, account_id);

    for (const item of lineItems) {
      db.prepare(
        "INSERT INTO ledger_items (id, ledger_id, description, amount, commitment_id, instance_due_date) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), id, item.description, item.amount, item.commitment_id || null, item.instance_due_date || null);
    }

    for (const alloc of allocs) {
      const commitment = db.prepare("SELECT amount FROM commitments WHERE id = ?").get(alloc.commitment_id) as { amount: number } | undefined;
      if (!commitment) throw new Error(`Commitment ${alloc.commitment_id} not found`);

      const instanceId = ensureInstance(db, alloc.commitment_id, alloc.instance_due_date, commitment.amount);

      const instance = db.prepare("SELECT planned_amount, allocated_amount FROM commitment_instances WHERE id = ?")
        .get(instanceId) as { planned_amount: number; allocated_amount: number };
      const remaining = instance.planned_amount - instance.allocated_amount;

      if (alloc.amount > remaining + 0.005) {
        throw new Error(`Allocation of $${alloc.amount.toFixed(2)} exceeds remaining $${remaining.toFixed(2)} for commitment`);
      }

      db.prepare(
        "INSERT INTO commitment_allocations (id, ledger_id, instance_id, commitment_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(randomUUID(), id, instanceId, alloc.commitment_id, alloc.amount, alloc.note || null);

      const newAllocated = instance.allocated_amount + alloc.amount;
      const newStatus = newAllocated >= instance.planned_amount - 0.005 ? "funded" : "open";

      db.prepare(
        "UPDATE commitment_instances SET allocated_amount = ?, status = ? WHERE id = ?"
      ).run(newAllocated, newStatus, instanceId);
    }
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Transaction failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true, id });
}
