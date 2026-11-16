const SETTLED = new Set(["paid", "funded", "skipped", "deferred"]);

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
    due_date: string;
    instances?: PayableInstance[] | null;
  },
  today: string,
): string | null {
  if (commitment.type === "income") return null;

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
