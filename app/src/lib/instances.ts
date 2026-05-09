import { addDays, addWeeks, addMonths, format, startOfDay } from "date-fns";
import { expandRecurrence } from "./projection";
import { CommitmentInstance } from "./types";
import {
  ensureInstance as ensureFirestoreInstance,
  getCommitment,
  getInstance,
  listCommitments,
  listInstancesForCommitment,
} from "./repositories/firestore";

export function advanceByRule(base: Date, rule: string): Date {
  if (rule.startsWith("every_")) {
    if (rule.endsWith("_days")) {
      const n = parseInt(rule.slice(6, -5), 10);
      if (!isNaN(n) && n > 0) return addDays(base, n);
    }
    if (rule.endsWith("_weeks")) {
      const n = parseInt(rule.slice(6, -6), 10);
      if (!isNaN(n) && n > 0) return addWeeks(base, n);
    }
  }
  switch (rule) {
    case "weekly": return addDays(base, 7);
    case "biweekly": return addWeeks(base, 2);
    case "monthly": return addMonths(base, 1);
    case "quarterly": return addMonths(base, 3);
    case "annual": return addMonths(base, 12);
    default: return addMonths(base, 1);
  }
}

export async function ensureInstance(
  userId: string,
  commitmentId: string,
  dueDate: string,
  plannedAmount: number
): Promise<string> {
  return ensureFirestoreInstance(userId, commitmentId, dueDate, plannedAmount);
}

export async function getInstanceRow(
  userId: string,
  commitmentId: string,
  dueDate: string
): Promise<CommitmentInstance | null> {
  return getInstance(userId, commitmentId, dueDate);
}

export async function getOrExpandInstances(
  userId: string,
  commitmentId: string,
  windowEnd: Date
): Promise<CommitmentInstance[]> {
  const commitment = await getCommitment(userId, commitmentId);
  if (!commitment) return [];

  const today = startOfDay(new Date());
  const occurrences = expandRecurrence(commitment, today, windowEnd);

  for (const occ of occurrences) {
    await ensureInstance(userId, commitmentId, format(occ, "yyyy-MM-dd"), commitment.amount);
  }

  return listInstancesForCommitment(userId, commitmentId, format(windowEnd, "yyyy-MM-dd"));
}

export async function getEligibleInstances(userId: string): Promise<CommitmentInstance[]> {
  const today = startOfDay(new Date());
  const windowEnd = addDays(today, 28);
  const todayStr = format(today, "yyyy-MM-dd");
  const windowEndStr = format(windowEnd, "yyyy-MM-dd");
  const commitments = (await listCommitments(userId)).filter((c) => c.active === 1 && c.paid === 0);

  const rows: CommitmentInstance[] = [];
  for (const commitment of commitments) {
    if (commitment.due_date < todayStr) {
      await ensureInstance(userId, commitment.id, commitment.due_date, commitment.amount);
    }
    for (const occ of expandRecurrence(commitment, today, windowEnd)) {
      await ensureInstance(userId, commitment.id, format(occ, "yyyy-MM-dd"), commitment.amount);
    }
    const instances = await listInstancesForCommitment(userId, commitment.id, windowEndStr);
    rows.push(
      ...instances
        .filter((i) => i.status === "open" && i.due_date <= windowEndStr)
        .map((i) => ({ ...i, commitment_name: commitment.name, commitment_type: commitment.type }))
    );
  }

  return rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export async function getAllInstancesForCommitments(
  userId: string,
  windowEnd: Date
): Promise<CommitmentInstance[]> {
  const today = startOfDay(new Date());
  const todayStr = format(today, "yyyy-MM-dd");
  const windowEndStr = format(windowEnd, "yyyy-MM-dd");
  const commitments = (await listCommitments(userId)).filter((c) => c.active === 1);

  const rows: CommitmentInstance[] = [];
  for (const commitment of commitments) {
    if (commitment.paid && !commitment.recurrence_rule) continue;
    if (commitment.due_date < todayStr) {
      await ensureInstance(userId, commitment.id, commitment.due_date, commitment.amount);
    }
    for (const occ of expandRecurrence(commitment, today, windowEnd)) {
      await ensureInstance(userId, commitment.id, format(occ, "yyyy-MM-dd"), commitment.amount);
    }
    const instances = await listInstancesForCommitment(userId, commitment.id, windowEndStr);
    rows.push(...instances.map((i) => ({ ...i, commitment_name: commitment.name, commitment_type: commitment.type })));
  }

  return rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
