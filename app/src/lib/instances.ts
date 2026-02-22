import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import { addDays, format, startOfDay } from "date-fns";
import { expandRecurrence } from "./projection";
import { CommitmentInstance } from "./types";

interface CommitmentRow {
  id: string;
  name: string;
  type: "income" | "bill";
  amount: number;
  due_date: string;
  recurrence_rule: string | null;
  priority: string;
  autopay: number;
  account_id: string | null;
  active: number;
  paid: number;
}

export function ensureInstance(
  db: Database.Database,
  commitmentId: string,
  dueDate: string,
  plannedAmount: number
): string {
  db.prepare(
    `INSERT OR IGNORE INTO commitment_instances (id, commitment_id, due_date, planned_amount)
     VALUES (?, ?, ?, ?)`
  ).run(randomUUID(), commitmentId, dueDate, plannedAmount);

  const row = db
    .prepare("SELECT id FROM commitment_instances WHERE commitment_id = ? AND due_date = ?")
    .get(commitmentId, dueDate) as { id: string };

  return row.id;
}

export function getInstanceRow(
  db: Database.Database,
  commitmentId: string,
  dueDate: string
): CommitmentInstance | null {
  const row = db
    .prepare(
      `SELECT ci.*, c.name as commitment_name, c.type as commitment_type
       FROM commitment_instances ci
       JOIN commitments c ON c.id = ci.commitment_id
       WHERE ci.commitment_id = ? AND ci.due_date = ?`
    )
    .get(commitmentId, dueDate) as (CommitmentInstance & { commitment_name: string; commitment_type: string }) | undefined;

  if (!row) return null;

  return {
    ...row,
    remaining_amount: row.planned_amount - row.allocated_amount,
  };
}

export function getOrExpandInstances(
  db: Database.Database,
  commitmentId: string,
  windowEnd: Date
): CommitmentInstance[] {
  const commitment = db
    .prepare("SELECT * FROM commitments WHERE id = ?")
    .get(commitmentId) as CommitmentRow | undefined;

  if (!commitment) return [];

  const today = startOfDay(new Date());
  const occurrences = expandRecurrence(commitment, today, windowEnd);

  for (const occ of occurrences) {
    const dateStr = format(occ, "yyyy-MM-dd");
    ensureInstance(db, commitmentId, dateStr, commitment.amount);
  }

  const rows = db
    .prepare(
      `SELECT ci.*, c.name as commitment_name, c.type as commitment_type
       FROM commitment_instances ci
       JOIN commitments c ON c.id = ci.commitment_id
       WHERE ci.commitment_id = ? AND ci.due_date >= ? AND ci.due_date <= ?
       ORDER BY ci.due_date ASC`
    )
    .all(commitmentId, format(today, "yyyy-MM-dd"), format(windowEnd, "yyyy-MM-dd")) as CommitmentInstance[];

  return rows.map((r) => ({
    ...r,
    remaining_amount: r.planned_amount - r.allocated_amount,
  }));
}

export function getEligibleInstances(db: Database.Database): CommitmentInstance[] {
  const today = startOfDay(new Date());
  const windowEnd = addDays(today, 28);
  const todayStr = format(today, "yyyy-MM-dd");
  const windowEndStr = format(windowEnd, "yyyy-MM-dd");

  const commitments = db
    .prepare("SELECT * FROM commitments WHERE active = 1 AND paid = 0")
    .all() as CommitmentRow[];

  for (const commitment of commitments) {
    if (commitment.due_date < todayStr) {
      ensureInstance(db, commitment.id, commitment.due_date, commitment.amount);
    }
    const occurrences = expandRecurrence(commitment, today, windowEnd);
    for (const occ of occurrences) {
      const dateStr = format(occ, "yyyy-MM-dd");
      ensureInstance(db, commitment.id, dateStr, commitment.amount);
    }
  }

  const rows = db
    .prepare(
      `SELECT ci.*, c.name as commitment_name, c.type as commitment_type
       FROM commitment_instances ci
       JOIN commitments c ON c.id = ci.commitment_id
       WHERE ci.status = 'open'
         AND c.active = 1
         AND ci.due_date <= ?
       ORDER BY ci.due_date ASC`
    )
    .all(windowEndStr) as CommitmentInstance[];

  return rows.map((r) => ({
    ...r,
    remaining_amount: r.planned_amount - r.allocated_amount,
  }));
}

export function getAllInstancesForCommitments(
  db: Database.Database,
  windowEnd: Date
): CommitmentInstance[] {
  const today = startOfDay(new Date());
  const todayStr = format(today, "yyyy-MM-dd");
  const windowEndStr = format(windowEnd, "yyyy-MM-dd");

  const commitments = db
    .prepare("SELECT * FROM commitments WHERE active = 1")
    .all() as CommitmentRow[];

  for (const commitment of commitments) {
    if (commitment.paid && !commitment.recurrence_rule) continue;
    if (commitment.due_date < todayStr) {
      ensureInstance(db, commitment.id, commitment.due_date, commitment.amount);
    }
    const occurrences = expandRecurrence(commitment, today, windowEnd);
    for (const occ of occurrences) {
      const dateStr = format(occ, "yyyy-MM-dd");
      ensureInstance(db, commitment.id, dateStr, commitment.amount);
    }
  }

  const rows = db
    .prepare(
      `SELECT ci.*, c.name as commitment_name, c.type as commitment_type
       FROM commitment_instances ci
       JOIN commitments c ON c.id = ci.commitment_id
       WHERE c.active = 1
         AND ci.due_date <= ?
       ORDER BY ci.due_date ASC`
    )
    .all(windowEndStr) as CommitmentInstance[];

  return rows.map((r) => ({
    ...r,
    remaining_amount: r.planned_amount - r.allocated_amount,
  }));
}
