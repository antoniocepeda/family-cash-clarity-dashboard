import { differenceInCalendarDays, format, parseISO } from "date-fns";

export const DATE_WINDOW_DAYS = 10;
/** Auto-match only when the nearest due date is at least this many days closer than the runner-up. */
export const DATE_TIEBREAK_DAYS = 4;
export const AMOUNT_TOLERANCE_RATIO = 0.4;
export const AMOUNT_TOLERANCE_FLOOR = 50;
export const HELP_PROMPT_LIMIT = 8;

const SETTLED = new Set(["paid", "funded", "skipped", "deferred"]);
const NOISE = new Set([
  "pos", "debit", "credit", "purchase", "payment", "online", "the", "and", "ach", "web",
  "recurring", "autopay", "bill", "pymt", "pmt", "card", "visa", "mastercard",
]);

export type OpenBill = {
  commitmentId: string;
  instanceId: string;
  name: string;
  dueDate: string;
  plannedAmount: number;
  status: string;
  type: "income" | "bill";
  /** Extra bank-statement names for this bill, besides the display name. */
  bankMatchTags?: string[];
  /** App account id, Plaid account id, or card mask this bill is paid from. */
  accountHint?: string | null;
};

export type BankTxn = {
  id: string;
  name: string;
  amount: number;
  date: string;
  pending?: boolean;
  linked?: boolean;
  accountId?: string | null;
  accountMask?: string | null;
};

export type AutoMatch = {
  commitmentId: string;
  instanceId: string;
  dueDate: string;
  transactionId: string;
  actualAmount: number;
};

export type HelpChoice = {
  id: string;
  label: string;
  action: "assign" | "dismiss";
  commitmentId?: string;
  instanceId?: string;
  dueDate?: string;
  transactionId?: string;
};

export type HelpPrompt = {
  id: string;
  reason: "ambiguous" | "unmatched_past";
  title: string;
  detail: string;
  instanceId?: string;
  choices: HelpChoice[];
};

export function amountWithinTolerance(planned: number, actual: number) {
  const diff = Math.abs(planned - actual);
  const limit = Math.max(AMOUNT_TOLERANCE_FLOOR, Math.abs(planned) * AMOUNT_TOLERANCE_RATIO);
  return diff <= limit + 0.001;
}

export function withinDateWindow(dueDate: string, txnDate: string, windowDays = DATE_WINDOW_DAYS) {
  return Math.abs(differenceInCalendarDays(parseISO(txnDate), parseISO(dueDate))) <= windowDays;
}

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !NOISE.has(token));
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A bank-statement tag hit counts as a confident name match, above a single shared word. */
const TAG_MATCH_SCORE = 3;

function scoreAlias(alias: string, txnName: string) {
  const aliasTokens = tokens(alias);
  const txnTokens = new Set(tokens(txnName));
  let shared = 0;
  for (const token of aliasTokens) if (txnTokens.has(token)) shared += 1;
  if (shared > 0) return shared;

  const aliasCompact = compact(alias);
  const txnCompact = compact(txnName);
  if (aliasCompact.length >= 3 && txnCompact.includes(aliasCompact)) return 1;
  if (txnCompact.length >= 3 && aliasCompact.includes(txnCompact)) return 1;
  for (const token of aliasTokens) {
    if (token.length >= 4 && txnCompact.includes(token)) return 1;
  }
  return 0;
}

export function merchantScore(billName: string, txnName: string, tags: readonly string[] = []) {
  let best = scoreAlias(billName, txnName);
  for (const tag of tags) {
    if (!tag.trim()) continue;
    if (scoreAlias(tag, txnName) > 0) best = Math.max(best, TAG_MATCH_SCORE);
  }
  return best;
}

/** Turn a posted merchant string into a short tag, dropping payment noise. */
export function cleanMerchantTag(merchantName: string): string | null {
  const kept = merchantName
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !NOISE.has(token.toLowerCase()));
  if (kept.length === 0) return null;
  return kept.slice(0, 4).join(" ");
}

/** Parse a comma-separated field or a list into unique statement tags. */
export function normalizeBankTags(value: unknown): string[] {
  const parts: string[] = [];
  const push = (item: unknown) => {
    if (typeof item !== "string") return;
    for (const piece of item.split(/[,;|]/)) {
      const trimmed = piece.trim().replace(/\s+/g, " ");
      if (trimmed) parts.push(trimmed.slice(0, 40));
    }
  };
  if (Array.isArray(value)) value.forEach(push);
  else push(value);

  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const key = compact(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    tags.push(part);
    if (tags.length >= 12) break;
  }
  return tags;
}

/**
 * Append a cleaned merchant name. Existing tags stay as written.
 * The same name with different capitalization is not added again.
 */
export function normalizeAccountHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

/** Whether a bill's account hint agrees with the transaction. Unknown when either side is blank. */
export function accountHintRelation(
  hint: string | null | undefined,
  txn: { accountId?: string | null; accountMask?: string | null }
): "match" | "mismatch" | "unknown" {
  const hintKey = compact(hint ?? "");
  if (!hintKey) return "unknown";
  const keys = [txn.accountId, txn.accountMask]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => compact(value));
  if (keys.length === 0) return "unknown";
  const matched = keys.some((key) => key === hintKey || (hintKey.length >= 4 && key.endsWith(hintKey)) || (key.length >= 4 && hintKey.endsWith(key)));
  return matched ? "match" : "mismatch";
}

export function learnBankTag(existing: readonly string[] | null | undefined, merchantName: string): string[] {
  const tags = normalizeBankTags(existing);
  const cleaned = cleanMerchantTag(merchantName);
  if (!cleaned) return tags;
  const key = compact(cleaned);
  if (tags.some((tag) => compact(tag) === key)) return tags;
  return [...tags, cleaned];
}

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function shortDate(iso: string) {
  return format(parseISO(iso), "MMM d");
}

type Pair = {
  bill: OpenBill;
  txn: BankTxn;
  nameScore: number;
  amountDiff: number;
  dayDiff: number;
};

function viablePairs(group: Pair[]): Pair[] {
  const allowed = group.filter((pair) => accountHintRelation(pair.bill.accountHint, pair.txn) !== "mismatch");
  const hinted = allowed.filter((pair) => accountHintRelation(pair.bill.accountHint, pair.txn) === "match");
  return hinted.length > 0 ? hinted : allowed;
}

/** Closest due date wins when it leads by DATE_TIEBREAK_DAYS. A single option always wins. */
function clearWinner(group: Pair[]): Pair | null {
  const options = [...viablePairs(group)].sort(
    (a, b) => a.dayDiff - b.dayDiff || b.nameScore - a.nameScore || a.bill.instanceId.localeCompare(b.bill.instanceId)
  );
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];
  if (options[1].dayDiff - options[0].dayDiff >= DATE_TIEBREAK_DAYS) return options[0];
  return null;
}

function candidatePairs(bills: OpenBill[], txns: BankTxn[], requireName: boolean): Pair[] {
  const pairs: Pair[] = [];
  for (const txn of txns) {
    if (txn.pending || txn.linked || txn.amount <= 0) continue;
    for (const bill of bills) {
      if (bill.type !== "bill" || SETTLED.has(bill.status)) continue;
      if (!withinDateWindow(bill.dueDate, txn.date)) continue;
      if (!amountWithinTolerance(bill.plannedAmount, txn.amount)) continue;
      const nameScore = merchantScore(bill.name, txn.name, bill.bankMatchTags ?? []);
      if (requireName && nameScore <= 0) continue;
      pairs.push({
        bill,
        txn,
        nameScore,
        amountDiff: Math.abs(bill.plannedAmount - txn.amount),
        dayDiff: Math.abs(differenceInCalendarDays(parseISO(txn.date), parseISO(bill.dueDate))),
      });
    }
  }
  return pairs;
}

function billChoice(bill: OpenBill, txn: BankTxn): HelpChoice {
  return {
    id: `bill:${bill.instanceId}`,
    label: `${bill.name} · ${money(bill.plannedAmount)} · ${shortDate(bill.dueDate)}`,
    action: "assign",
    commitmentId: bill.commitmentId,
    instanceId: bill.instanceId,
    dueDate: bill.dueDate,
    transactionId: txn.id,
  };
}

export function withoutPrompt<T extends { id: string }>(prompts: T[], promptId: string): T[] {
  return prompts.filter((prompt) => prompt.id !== promptId);
}

export function restorePrompt<T extends { id: string }>(prompts: T[], prompt: T): T[] {
  if (prompts.some((item) => item.id === prompt.id)) return prompts;
  return [prompt, ...prompts];
}

/** The writes for one tap. A full reconcile is not part of this step. */
export function resolveChoiceWork(prompt: HelpPrompt, choiceId: string):
  | { action: "assign"; commitmentId: string; instanceId: string; transactionId: string }
  | { action: "skip"; instanceId: string }
  | { action: "dismiss" } {
  const choice = prompt.choices.find((item) => item.id === choiceId);
  if (!choice) throw new Error("Choice not found");
  if (choice.action === "assign") {
    if (!choice.transactionId || !choice.instanceId || !choice.commitmentId) throw new Error("Choice is incomplete");
    return {
      action: "assign",
      commitmentId: choice.commitmentId,
      instanceId: choice.instanceId,
      transactionId: choice.transactionId,
    };
  }
  if (prompt.reason === "unmatched_past") {
    const instanceId = choice.instanceId || prompt.instanceId;
    if (instanceId) return { action: "skip", instanceId };
  }
  return { action: "dismiss" };
}

export function planReconciliation(input: {
  bills: OpenBill[];
  transactions: BankTxn[];
  today: string;
  dismissedPromptIds: string[];
}): { matches: AutoMatch[]; prompts: HelpPrompt[] } {
  const dismissed = new Set(input.dismissedPromptIds);
  const namedPairs = candidatePairs(input.bills, input.transactions, true);
  const assignedBills = new Set<string>();
  const assignedTxns = new Set<string>();
  const matches: AutoMatch[] = [];

  const remaining = () =>
    namedPairs.filter((pair) => !assignedBills.has(pair.bill.instanceId) && !assignedTxns.has(pair.txn.id));

  const tryAssign = (open: Pair[]) => {
    const byTxn = new Map<string, Pair[]>();
    for (const pair of open) {
      const group = byTxn.get(pair.txn.id) ?? [];
      group.push(pair);
      byTxn.set(pair.txn.id, group);
    }
    let assigned = false;
    for (const group of byTxn.values()) {
      const live = group.filter((pair) => !assignedBills.has(pair.bill.instanceId) && !assignedTxns.has(pair.txn.id));
      const winner = clearWinner(live);
      if (!winner) continue;
      if (assignedBills.has(winner.bill.instanceId) || assignedTxns.has(winner.txn.id)) continue;
      const billLive = open.filter(
        (pair) =>
          pair.bill.instanceId === winner.bill.instanceId &&
          !assignedBills.has(pair.bill.instanceId) &&
          !assignedTxns.has(pair.txn.id)
      );
      const billWinner = clearWinner(billLive);
      if (!billWinner || billWinner.txn.id !== winner.txn.id) continue;
      assignedBills.add(winner.bill.instanceId);
      assignedTxns.add(winner.txn.id);
      matches.push({
        commitmentId: winner.bill.commitmentId,
        instanceId: winner.bill.instanceId,
        dueDate: winner.bill.dueDate,
        transactionId: winner.txn.id,
        actualAmount: winner.txn.amount,
      });
      assigned = true;
    }
    return assigned;
  };

  let progressed = true;
  while (progressed) progressed = tryAssign(remaining());

  const prompts: HelpPrompt[] = [];
  const ambiguousTxns = new Set<string>();
  const ambiguousBills = new Set<string>();
  const openNamed = remaining();
  const ambiguousGroups = new Map<string, Pair[]>();
  for (const pair of openNamed) {
    const group = ambiguousGroups.get(pair.txn.id) ?? [];
    group.push(pair);
    ambiguousGroups.set(pair.txn.id, group);
  }
  for (const [txnId, group] of ambiguousGroups) {
    const options = viablePairs(group);
    if (options.length < 2 || clearWinner(options)) continue;
    const txn = options[0].txn;
    const id = `ambiguous:${txnId}`;
    ambiguousTxns.add(txnId);
    if (dismissed.has(id)) continue;
    const uniqueBills = new Map(options.map((pair) => [pair.bill.instanceId, pair.bill]));
    for (const billId of uniqueBills.keys()) ambiguousBills.add(billId);
    prompts.push({
      id,
      reason: "ambiguous",
      title: `Which bill was ${txn.name} for ${money(txn.amount)}?`,
      detail: `Posted ${shortDate(txn.date)}. The amount is close to more than one bill.`,
      choices: [
        ...[...uniqueBills.values()].map((bill) => billChoice(bill, txn)),
        { id: "dismiss", label: "Not a bill", action: "dismiss" },
      ],
    });
  }

  const loosePairs = candidatePairs(input.bills, input.transactions, false);
  for (const bill of input.bills) {
    if (bill.type !== "bill" || SETTLED.has(bill.status) || assignedBills.has(bill.instanceId)) continue;
    if (ambiguousBills.has(bill.instanceId)) continue;
    if (bill.dueDate >= input.today) continue;
    const id = `unmatched:${bill.instanceId}`;
    if (dismissed.has(id)) continue;
    const choices = new Map<string, HelpChoice>();
    for (const pair of loosePairs) {
      if (pair.bill.instanceId !== bill.instanceId) continue;
      if (assignedTxns.has(pair.txn.id) || ambiguousTxns.has(pair.txn.id)) continue;
      choices.set(pair.txn.id, {
        id: `txn:${pair.txn.id}`,
        label: `${pair.txn.name} · ${money(pair.txn.amount)} · ${shortDate(pair.txn.date)}`,
        action: "assign",
        commitmentId: bill.commitmentId,
        instanceId: bill.instanceId,
        dueDate: bill.dueDate,
        transactionId: pair.txn.id,
      });
    }
    prompts.push({
      id,
      reason: "unmatched_past",
      title: `${bill.name} was due ${shortDate(bill.dueDate)}`,
      detail: `${money(bill.plannedAmount)} is still open and no payment matched it.`,
      instanceId: bill.instanceId,
      choices: [
        ...choices.values(),
        { id: "dismiss", label: "Dismiss", action: "dismiss", instanceId: bill.instanceId, commitmentId: bill.commitmentId },
      ],
    });
  }

  const ranked = prompts.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "ambiguous" ? -1 : 1;
    return (b.instanceId ?? b.id).localeCompare(a.instanceId ?? a.id);
  });

  return { matches, prompts: ranked.slice(0, HELP_PROMPT_LIMIT) };
}
