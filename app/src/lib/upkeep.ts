import "server-only";

import { format, startOfDay } from "date-fns";
import { materializeRollingInstances } from "@/lib/instances";
import { planReconciliation, type BankTxn, type HelpChoice, type OpenBill } from "@/lib/reconcile";
import {
  closeInstanceAsPaid,
  listCommitments,
  listInstances,
  listLedger,
  listReconcilePromptDocs,
  saveReconcilePrompt,
  setReconcilePromptStatus,
  skipInstance,
} from "@/lib/repositories/firestore";

export async function reconcileOpenBills(userId: string) {
  const materialized = await materializeRollingInstances(userId);
  const today = format(startOfDay(new Date()), "yyyy-MM-dd");
  const [commitments, instances, ledger, stored] = await Promise.all([
    listCommitments(userId, false),
    listInstances(userId),
    listLedger(userId),
    listReconcilePromptDocs(userId),
  ]);
  const byId = new Map(commitments.map((commitment) => [commitment.id, commitment]));
  const linkedLedgers = new Set(
    ledger.filter((entry) => entry.commitment_id || (entry.allocations?.length ?? 0) > 0).map((entry) => entry.id)
  );
  const bills: OpenBill[] = instances.map((instance) => {
    const commitment = byId.get(instance.commitment_id);
    return {
      commitmentId: instance.commitment_id,
      instanceId: instance.id,
      name: instance.name_override || commitment?.name || instance.commitment_name || "Bill",
      dueDate: instance.due_date,
      plannedAmount: instance.planned_amount,
      status: instance.status,
      type: commitment?.type ?? instance.commitment_type ?? "bill",
    };
  });
  const transactions: BankTxn[] = ledger
    .filter((entry) => entry.type === "expense" && !entry.removed)
    .map((entry) => ({
      id: entry.id,
      name: entry.description,
      amount: entry.amount,
      date: entry.date,
      pending: Boolean(entry.pending),
      linked: linkedLedgers.has(entry.id),
    }));

  const plan = planReconciliation({
    bills,
    transactions,
    today,
    dismissedPromptIds: stored.filter((prompt) => prompt.status === "dismissed").map((prompt) => prompt.id),
  });

  let matched = 0;
  for (const match of plan.matches) {
    const result = await closeInstanceAsPaid(userId, {
      instanceId: match.instanceId,
      ledgerId: match.transactionId,
      commitmentId: match.commitmentId,
      actualAmount: match.actualAmount,
    });
    if (!result.alreadySettled) matched += 1;
  }

  const openIds = new Set(plan.prompts.map((prompt) => prompt.id));
  for (const prompt of plan.prompts) await saveReconcilePrompt(userId, prompt, "open");
  for (const existing of stored) {
    if (existing.status === "dismissed" || openIds.has(existing.id)) continue;
    await setReconcilePromptStatus(userId, existing.id, "resolved");
  }

  return { materialized, matched, prompts: plan.prompts };
}

export async function resolveReconcileChoice(userId: string, promptId: string, choiceId: string) {
  const stored = await listReconcilePromptDocs(userId);
  const prompt = stored.find((item) => item.id === promptId);
  if (!prompt) throw new Error("Prompt not found");
  const choice = (prompt.choices as HelpChoice[]).find((item) => item.id === choiceId);
  if (!choice) throw new Error("Choice not found");

  if (choice.action === "assign") {
    if (!choice.transactionId || !choice.instanceId || !choice.commitmentId) throw new Error("Choice is incomplete");
    const ledger = await listLedger(userId);
    const txn = ledger.find((entry) => entry.id === choice.transactionId);
    if (!txn || txn.removed || txn.pending) throw new Error("Transaction is not available to match");
    await closeInstanceAsPaid(userId, {
      instanceId: choice.instanceId,
      ledgerId: txn.id,
      commitmentId: choice.commitmentId,
      actualAmount: txn.amount,
    });
  } else if (prompt.reason === "unmatched_past") {
    const instanceId = choice.instanceId || prompt.instanceId;
    if (instanceId) await skipInstance(userId, instanceId);
  }

  await setReconcilePromptStatus(userId, promptId, "dismissed");
  return reconcileOpenBills(userId);
}

export async function runHouseholdUpkeep(userId: string) {
  return reconcileOpenBills(userId);
}
