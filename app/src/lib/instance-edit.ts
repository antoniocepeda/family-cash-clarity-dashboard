export type InstanceLite = {
  id: string;
  original_due_date: string;
  due_date: string;
  allocated_amount: number;
  status: string;
  edited_from_template?: boolean;
};

export function instanceDocId(commitmentId: string, dueDate: string) {
  return `${commitmentId}_${dueDate}`;
}

function isShell(inst: InstanceLite) {
  return (
    inst.allocated_amount <= 0.005 &&
    !inst.edited_from_template &&
    inst.status !== "paid" &&
    inst.status !== "funded" &&
    inst.status !== "skipped"
  );
}

/**
 * Scope "future" (and template) due-date edits must move the existing instance
 * onto the new date id. Empty copies already generated for the old schedule are removed
 * so a later read does not recreate the previous day beside the new one.
 */
export function planFutureDueDateEdit(input: {
  commitmentId: string;
  originalDueDate: string;
  nextDueDate: string;
  instances: InstanceLite[];
}): { moveFromId: string; moveToId: string; deleteIds: string[] } {
  const moveFromId = instanceDocId(input.commitmentId, input.originalDueDate);
  const moveToId = instanceDocId(input.commitmentId, input.nextDueDate);
  const deleteIds: string[] = [];

  if (input.nextDueDate === input.originalDueDate) {
    return { moveFromId, moveToId, deleteIds };
  }

  for (const inst of input.instances) {
    if (inst.id === moveFromId) continue;
    if (!isShell(inst)) continue;
    const isDestination = inst.id === moveToId || inst.due_date === input.nextDueDate;
    const isLaterInOldSeries = inst.original_due_date > input.originalDueDate;
    if (isDestination || isLaterInOldSeries) deleteIds.push(inst.id);
  }

  return { moveFromId, moveToId, deleteIds };
}

function keeperScore(inst: InstanceLite, canonicalId: string) {
  let score = 0;
  if (inst.allocated_amount > 0.005) score += 100;
  if (inst.status === "paid" || inst.status === "funded") score += 80;
  if (inst.edited_from_template) score += 40;
  if (inst.id === canonicalId) score += 10;
  return score;
}

function canDrop(inst: InstanceLite) {
  return inst.allocated_amount <= 0.005 && inst.status !== "paid" && inst.status !== "funded";
}

/**
 * When two rows land on the same due date, keep the one with history and
 * put it on the id for that date. Empty copies are removed.
 */
export function planDuplicateCleanup(commitmentId: string, instances: InstanceLite[]): {
  deleteIds: string[];
  relocate: { fromId: string; toId: string }[];
} {
  const byDue = new Map<string, InstanceLite[]>();
  for (const inst of instances) {
    const group = byDue.get(inst.due_date) ?? [];
    group.push(inst);
    byDue.set(inst.due_date, group);
  }

  const deleteIds: string[] = [];
  const relocate: { fromId: string; toId: string }[] = [];
  for (const [dueDate, group] of byDue) {
    if (group.length < 2) continue;
    const canonicalId = instanceDocId(commitmentId, dueDate);
    const ranked = [...group].sort((a, b) => keeperScore(b, canonicalId) - keeperScore(a, canonicalId));
    const keeper = ranked[0];
    const losers = group.filter((inst) => inst.id !== keeper.id && canDrop(inst));
    if (keeper.id !== canonicalId && losers.some((inst) => inst.id === canonicalId)) {
      relocate.push({ fromId: keeper.id, toId: canonicalId });
      for (const inst of losers) {
        if (inst.id !== canonicalId) deleteIds.push(inst.id);
      }
    } else {
      for (const inst of losers) deleteIds.push(inst.id);
    }
  }
  return { deleteIds, relocate };
}
