import { endOfMonth, format, parseISO } from "date-fns";

const SETTLED = new Set(["paid", "funded", "skipped", "deferred"]);

/** Missing and false keep today's match-and-alert behavior. */
export function isPaidOutside(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function isPaidOutsideBill(commitment: { type?: string | null; paid_outside?: unknown }): boolean {
  return commitment.type !== "income" && isPaidOutside(commitment.paid_outside);
}

export type PayableInstance = {
  due_date: string;
  status?: string | null;
  remaining_amount?: number | null;
};

/**
 * Earliest unpaid bill date that is already past, or null when nothing is outstanding.
 * Instance status and the effective due date decide this. The parent paid flag and
 * template due date are only a fallback when no instances have been materialized.
 */
export function unpaidPastDueDate(
  commitment: {
    type: string;
    paid?: number | boolean | null;
    paid_outside?: unknown;
    due_date: string;
    instances?: PayableInstance[] | null;
  },
  today: string,
): string | null {
  if (commitment.type === "income") return null;
  if (isPaidOutside(commitment.paid_outside)) return null;

  const instances = commitment.instances ?? [];
  if (instances.length > 0) {
    const dates = instances
      .filter((instance) => {
        if (!instance.due_date || instance.due_date >= today) return false;
        if (instance.status && SETTLED.has(instance.status)) return false;
        if (typeof instance.remaining_amount === "number" && instance.remaining_amount <= 0.005) return false;
        return true;
      })
      .map((instance) => instance.due_date)
      .sort();
    return dates[0] ?? null;
  }

  if (commitment.paid) return null;
  return commitment.due_date < today ? commitment.due_date : null;
}

export type OutsideBillCheck = {
  commitmentId: string;
  name: string;
  amount: number;
  dueDate: string;
};

type OutsideInstance = PayableInstance & {
  planned_amount?: number | null;
  name_override?: string | null;
};

/**
 * Unsettled months for bills paid from an account that is not linked.
 * Includes anything due through the end of this month, including older months
 * that are still open. Next month stays off the list until it arrives.
 */
export function outsideBillsToMark(
  commitments: Array<{
    id: string;
    name: string;
    type: string;
    amount: number;
    due_date: string;
    paid?: number | boolean | null;
    paid_outside?: unknown;
    active?: number | boolean | null;
    instances?: OutsideInstance[] | null;
  }>,
  today: string,
): OutsideBillCheck[] {
  const monthEnd = format(endOfMonth(parseISO(today)), "yyyy-MM-dd");
  const items: OutsideBillCheck[] = [];
  for (const commitment of commitments) {
    if (!isPaidOutsideBill(commitment)) continue;
    if (commitment.active === 0 || commitment.active === false) continue;
    const instances = commitment.instances ?? [];
    if (instances.length === 0) {
      if (commitment.paid) continue;
      if (commitment.due_date <= monthEnd) {
        items.push({
          commitmentId: commitment.id,
          name: commitment.name,
          amount: commitment.amount,
          dueDate: commitment.due_date,
        });
      }
      continue;
    }
    for (const instance of instances) {
      if (!instance.due_date || instance.due_date > monthEnd) continue;
      if (instance.status && SETTLED.has(instance.status)) continue;
      items.push({
        commitmentId: commitment.id,
        name: instance.name_override?.trim() || commitment.name,
        amount: typeof instance.planned_amount === "number" ? instance.planned_amount : commitment.amount,
        dueDate: instance.due_date,
      });
    }
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
}
