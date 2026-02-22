import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureInstance } from "@/lib/instances";
import { AllocationInput } from "@/lib/types";
import { randomUUID } from "crypto";

function reverseAllocations(db: ReturnType<typeof getDb>, ledgerId: string) {
  const existing = db
    .prepare("SELECT instance_id, amount FROM commitment_allocations WHERE ledger_id = ?")
    .all(ledgerId) as { instance_id: string; amount: number }[];

  for (const alloc of existing) {
    db.prepare(
      "UPDATE commitment_instances SET allocated_amount = MAX(0, allocated_amount - ?), status = 'open' WHERE id = ?"
    ).run(alloc.amount, alloc.instance_id);
  }

  db.prepare("DELETE FROM commitment_allocations WHERE ledger_id = ?").run(ledgerId);
}

function applyAllocations(
  db: ReturnType<typeof getDb>,
  ledgerId: string,
  allocs: AllocationInput[]
) {
  for (const alloc of allocs) {
    const commitment = db.prepare("SELECT amount FROM commitments WHERE id = ?").get(alloc.commitment_id) as { amount: number } | undefined;
    if (!commitment) throw new Error(`Commitment ${alloc.commitment_id} not found`);

    const instanceId = ensureInstance(db, alloc.commitment_id, alloc.instance_due_date, commitment.amount);

    const instance = db.prepare("SELECT planned_amount, allocated_amount FROM commitment_instances WHERE id = ?")
      .get(instanceId) as { planned_amount: number; allocated_amount: number };
    const remaining = instance.planned_amount - instance.allocated_amount;

    if (alloc.amount > remaining + 0.005) {
      throw new Error(`Allocation of $${alloc.amount.toFixed(2)} exceeds remaining $${remaining.toFixed(2)}`);
    }

    db.prepare(
      "INSERT INTO commitment_allocations (id, ledger_id, instance_id, commitment_id, amount, note) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(randomUUID(), ledgerId, instanceId, alloc.commitment_id, alloc.amount, alloc.note || null);

    const newAllocated = instance.allocated_amount + alloc.amount;
    const newStatus = newAllocated >= instance.planned_amount - 0.005 ? "funded" : "open";

    db.prepare(
      "UPDATE commitment_instances SET allocated_amount = ?, status = ? WHERE id = ?"
    ).run(newAllocated, newStatus, instanceId);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { description, amount, type, account_id, allocations } = body;

  const db = getDb();
  const existing = db.prepare("SELECT * FROM ledger WHERE id = ?").get(id) as {
    id: string; amount: number; type: string; account_id: string;
  } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
  }

  const newAmount = amount ?? existing.amount;
  const newType = type ?? existing.type;
  const newAccountId = account_id ?? existing.account_id;
  const allocs: AllocationInput[] = allocations || [];

  if (allocs.length > 0) {
    const allocTotal = allocs.reduce((s: number, a: AllocationInput) => s + a.amount, 0);
    if (Math.abs(allocTotal - newAmount) > 0.005) {
      return NextResponse.json(
        { error: `Allocation total must equal transaction amount` },
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

  const run = db.transaction(() => {
    const oldImpact = existing.type === "income" ? existing.amount : -existing.amount;
    db.prepare(
      "UPDATE accounts SET current_balance = current_balance - ?, updated_at = datetime('now') WHERE id = ?"
    ).run(oldImpact, existing.account_id);

    reverseAllocations(db, id);

    db.prepare(
      "UPDATE ledger SET description = ?, amount = ?, type = ?, account_id = ? WHERE id = ?"
    ).run(description ?? existing.amount, newAmount, newType, newAccountId, id);

    const newImpact = newType === "income" ? newAmount : -newAmount;
    db.prepare(
      "UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(newImpact, newAccountId);

    if (allocs.length > 0) {
      applyAllocations(db, id, allocs);
    }
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT * FROM ledger WHERE id = ?").get(id) as {
    id: string; amount: number; type: string; account_id: string;
  } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
  }

  const run = db.transaction(() => {
    reverseAllocations(db, id);

    const impact = existing.type === "income" ? existing.amount : -existing.amount;
    db.prepare(
      "UPDATE accounts SET current_balance = current_balance - ?, updated_at = datetime('now') WHERE id = ?"
    ).run(impact, existing.account_id);

    db.prepare("DELETE FROM ledger WHERE id = ?").run(id);
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
