import { addDays, format, startOfDay } from "date-fns";
import { planDuplicateCleanup } from "./instance-edit";
import { expandRecurrence } from "./projection";
import {
  expandOccurrenceDates,
  materializeHorizonEnd,
  RECONCILE_LOOKBACK_DAYS,
} from "./schedule";
import { CommitmentInstance } from "./types";
import {
  deleteInstances,
  ensureInstance as ensureFirestoreInstance,
  relocateInstance,
  getCommitment,
  getInstance,
  listCommitments,
  listInstances,
  listInstancesForCommitment,
  markInstanceOverdue,
} from "./repositories/firestore";

export { advanceByRule } from "./schedule";

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

export async function materializeRollingInstances(userId: string): Promise<{ ensured: number; removedDuplicates: number }> {
  const today = startOfDay(new Date());
  const todayStr = format(today, "yyyy-MM-dd");
  const windowStart = addDays(today, -RECONCILE_LOOKBACK_DAYS);
  const windowEnd = materializeHorizonEnd(today);
  const commitments = (await listCommitments(userId)).filter((commitment) => commitment.active === 1);
  const all = await listInstances(userId);
  let ensured = 0;
  let removedDuplicates = 0;

  for (const commitment of commitments) {
    if (commitment.paid && !commitment.recurrence_rule) continue;
    const mine = all.filter((instance) => instance.commitment_id === commitment.id);
    const cleanup = planDuplicateCleanup(commitment.id, mine);
    for (const move of cleanup.relocate) {
      const source = mine.find((instance) => instance.id === move.fromId);
      if (!source) continue;
      await relocateInstance(userId, commitment.id, move.fromId, move.toId, {
        due_date: source.due_date,
        dueDate: source.due_date,
        original_due_date: source.due_date,
        originalDueDate: source.due_date,
        override_due_date: null,
        overrideDueDate: null,
      });
      removedDuplicates += 1;
    }
    if (cleanup.deleteIds.length > 0) {
      await deleteInstances(userId, cleanup.deleteIds);
      removedDuplicates += cleanup.deleteIds.length;
    }
    const removed = new Set([
      ...cleanup.deleteIds,
      ...cleanup.relocate.map((move) => move.fromId),
      ...cleanup.relocate.map((move) => move.toId),
    ]);
    const live = mine.filter((instance) => !removed.has(instance.id));
    const occupied = new Set(live.map((instance) => instance.due_date));
    for (const move of cleanup.relocate) {
      const source = mine.find((instance) => instance.id === move.fromId);
      if (source) occupied.add(source.due_date);
    }
    for (const date of expandOccurrenceDates(commitment, windowStart, windowEnd)) {
      const key = format(date, "yyyy-MM-dd");
      if (occupied.has(key)) continue;
      await ensureInstance(userId, commitment.id, key, commitment.amount);
      occupied.add(key);
      ensured += 1;
    }
    for (const instance of live) {
      if (
        instance.due_date < todayStr &&
        (instance.status === "planned" || instance.status === "open") &&
        instance.allocated_amount <= 0.005
      ) {
        await markInstanceOverdue(userId, instance.id);
      }
    }
  }

  return { ensured, removedDuplicates };
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
        .filter((i) => !["paid", "funded", "skipped", "deferred"].includes(i.status) && i.due_date <= windowEndStr)
        .map((i) => ({ ...i, commitment_name: commitment.name, commitment_type: commitment.type }))
    );
  }

  return rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export async function getAllInstancesForCommitments(
  userId: string,
  windowEnd: Date
): Promise<CommitmentInstance[]> {
  await materializeRollingInstances(userId);
  const horizon = materializeHorizonEnd(new Date());
  const end = windowEnd > horizon ? windowEnd : horizon;
  const endStr = format(end, "yyyy-MM-dd");
  const commitments = (await listCommitments(userId)).filter((c) => c.active === 1);
  const all = await listInstances(userId);

  const rows: CommitmentInstance[] = [];
  for (const commitment of commitments) {
    if (commitment.paid && !commitment.recurrence_rule) continue;
    for (const instance of all) {
      if (instance.commitment_id !== commitment.id) continue;
      if (instance.due_date > endStr && instance.original_due_date > endStr) continue;
      rows.push({ ...instance, commitment_name: commitment.name, commitment_type: commitment.type });
    }
  }

  return rows.sort((a, b) => a.due_date.localeCompare(b.due_date));
}
