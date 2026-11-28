import { differenceInCalendarDays, format, parseISO } from "date-fns";

export const DATE_WINDOW_DAYS = 10;
/** Auto-match only when the nearest due date is at least this many days closer than the runner-up. */
export const DATE_TIEBREAK_DAYS = 4;
/**
 * Inside that date tie, the closer amount wins when it leads by at least this many dollars.
 * A few cents is not enough to guess.
 */
export const AMOUNT_TIEBREAK_DOLLARS = 1;
export const AMOUNT_TOLERANCE_RATIO = 0.4;
export const AMOUNT_TOLERANCE_FLOOR = 50;
/**
 * Bills at or under this amount use a tight window: the greater of $5 and 10%.
 * The old $50 floor was as large as the bill itself, so a $20 subscription could
 * line up with a coffee charge. Larger bills keep the wider window (the greater
 * of $50 and 40%) because those amounts move more, such as a $200 phone bill
 * posting at $246.
 */
export const SMALL_BILL_CUTOFF = 50;
export const SMALL_BILL_TOLERANCE_RATIO = 0.1;
export const SMALL_BILL_TOLERANCE_FLOOR = 5;
/** Charge buttons on one overdue-bill question. */
export const QUESTION_CHARGE_LIMIT = 3;
/**
 * After "Not yet, still owe it", hide that question for this many days.
 * The bill stays owed the whole time, then the question comes back.
 */
export const STILL_OWE_REASK_DAYS = 4;
export const HELP_PROMPT_LIMIT = 8;

const SETTLED = new Set(["paid", "funded", "skipped", "deferred"]);
const NOISE = new Set([
  "pos", "debit", "credit", "purchase", "payment", "online", "the", "and", "ach", "web",
  "recurring", "autopay", "bill", "pymt", "pmt", "card", "visa", "mastercard",
  "com", "www", "net", "org", "inc", "llc", "ltd",
]);

/**
 * One-word statement tags that match too many different charges.
 * A specific one-word merchant such as Xfinity is not on this list.
 */
const GENERIC_MERCHANT_WORDS = new Set([
  "apple", "google", "amazon", "amzn", "meta", "microsoft", "samsung",
  "walmart", "target", "costco", "kroger", "paypal", "venmo", "square",
  "instacart", "uber", "lyft", "doordash",
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
  /** Paid from an account that is not linked. Left out of matching. */
  paidOutside?: boolean;
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
  action: "assign" | "dismiss" | "paid_elsewhere" | "still_owe" | "skip";
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

export type ChoiceWork =
  | { action: "assign"; commitmentId: string; instanceId: string; transactionId: string }
  | { action: "skip"; instanceId: string }
  | { action: "paid_elsewhere"; commitmentId: string; instanceId: string }
  | { action: "still_owe"; instanceId: string }
  | { action: "dismiss" };

export function amountLimit(planned: number) {
  const abs = Math.abs(planned);
  if (abs <= SMALL_BILL_CUTOFF) return Math.max(SMALL_BILL_TOLERANCE_FLOOR, abs * SMALL_BILL_TOLERANCE_RATIO);
  return Math.max(AMOUNT_TOLERANCE_FLOOR, abs * AMOUNT_TOLERANCE_RATIO);
}

export function amountWithinTolerance(planned: number, actual: number) {
  return Math.abs(planned - actual) <= amountLimit(planned) + 0.001;
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

/**
 * A learned tag is too generic when it is a single word and that word is a
 * common marketplace name, or another bill already uses the same word.
 * "Apple" is dropped. "Xfinity" is kept. "Apple Music" is kept because it is
 * two words. Manual statement names typed on Manage are not filtered here.
 */
export function tagIsTooGeneric(tag: string, siblingLabels: readonly string[] = []): boolean {
  const words = tokens(tag);
  if (words.length !== 1) return false;
  const word = words[0];
  if (GENERIC_MERCHANT_WORDS.has(word)) return true;
  return siblingLabels.some((label) => tokens(label).includes(word));
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
 * Generic single-word tags are not added.
 */
export function learnBankTag(
  existing: readonly string[] | null | undefined,
  merchantName: string,
  siblingLabels: readonly string[] = [],
): string[] {
  const tags = normalizeBankTags(existing);
  const cleaned = cleanMerchantTag(merchantName);
  if (!cleaned || tagIsTooGeneric(cleaned, siblingLabels)) return tags;
  const key = compact(cleaned);
  if (tags.some((tag) => compact(tag) === key)) return tags;
  return [...tags, cleaned];
}

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

/**
 * Closest due date wins when it leads by DATE_TIEBREAK_DAYS.
 * When dates are closer than that, the closer amount wins if it leads by
 * AMOUNT_TIEBREAK_DOLLARS. Otherwise the owner is asked.
 * A single option always wins.
 */
function clearWinner(group: Pair[]): Pair | null {
  const options = [...viablePairs(group)].sort(
    (a, b) =>
      a.dayDiff - b.dayDiff ||
      a.amountDiff - b.amountDiff ||
      b.nameScore - a.nameScore ||
      a.bill.instanceId.localeCompare(b.bill.instanceId) ||
      a.txn.id.localeCompare(b.txn.id)
  );
  if (options.length === 0) return null;
  if (options.length === 1) return options[0];
  if (options[1].dayDiff - options[0].dayDiff >= DATE_TIEBREAK_DAYS) return options[0];

  const cluster = options
    .filter((option) => option.dayDiff - options[0].dayDiff < DATE_TIEBREAK_DAYS)
    .sort(
      (a, b) =>
        a.amountDiff - b.amountDiff ||
        a.dayDiff - b.dayDiff ||
        b.nameScore - a.nameScore ||
        a.bill.instanceId.localeCompare(b.bill.instanceId) ||
        a.txn.id.localeCompare(b.txn.id)
    );
  if (cluster.length === 1) return cluster[0];
  if (cluster[1].amountDiff - cluster[0].amountDiff >= AMOUNT_TIEBREAK_DOLLARS) return cluster[0];
  return null;
}

function candidatePairs(bills: OpenBill[], txns: BankTxn[]): Pair[] {
  const pairs: Pair[] = [];
  for (const txn of txns) {
    if (txn.pending || txn.linked || txn.amount <= 0) continue;
    for (const bill of bills) {
      if (bill.paidOutside) continue;
      if (bill.type !== "bill" || SETTLED.has(bill.status)) continue;
      if (!withinDateWindow(bill.dueDate, txn.date)) continue;
      if (!amountWithinTolerance(bill.plannedAmount, txn.amount)) continue;
      const nameScore = merchantScore(bill.name, txn.name, bill.bankMatchTags ?? []);
      if (nameScore <= 0) continue;
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

function chargeChoice(bill: OpenBill, txn: BankTxn): HelpChoice {
  return {
    id: `txn:${txn.id}`,
    label: `Yes, this charge · ${txn.name} · ${money(txn.amount)} · ${shortDate(txn.date)}`,
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
export function resolveChoiceWork(prompt: HelpPrompt, choiceId: string): ChoiceWork {
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
  if (choice.action === "paid_elsewhere") {
    const instanceId = choice.instanceId || prompt.instanceId;
    if (!instanceId || !choice.commitmentId) throw new Error("Choice is incomplete");
    return { action: "paid_elsewhere", commitmentId: choice.commitmentId, instanceId };
  }
  if (choice.action === "still_owe") {
    const instanceId = choice.instanceId || prompt.instanceId;
    if (!instanceId) throw new Error("Choice is incomplete");
    return { action: "still_owe", instanceId };
  }
  if (choice.action === "skip") {
    const instanceId = choice.instanceId || prompt.instanceId;
    if (!instanceId) throw new Error("Choice is incomplete");
    return { action: "skip", instanceId };
  }
  // Older saved questions used Dismiss on a past bill to mean skip this month.
  if (prompt.reason === "unmatched_past") {
    const instanceId = choice.instanceId || prompt.instanceId;
    if (instanceId) return { action: "skip", instanceId };
  }
  return { action: "dismiss" };
}

/**
 * Every bill each month ends up either confirmed paid or flagged as still owed,
 * so safe-to-spend and the overdue alerts can be trusted. The owner is only
 * asked when the app truly can't tell, and answering takes one tap.
 *
 * A past-due bill with no linked payment asks "Did <name> ($amount) get paid?"
 * and offers at most three charges that match the bill name or a saved bank
 * name, closest amount first. "Yes, paid another way" marks that month paid
 * with no bank transaction (status paid, paid_elsewhere). "Not yet, still owe
 * it" leaves the bill owed and hides the question for STILL_OWE_REASK_DAYS.
 * "Skip this month" means it was not due and not paid. Bills flagged paid
 * outside linked accounts are not matched and are not asked about.
 */
export function planReconciliation(input: {
  bills: OpenBill[];
  transactions: BankTxn[];
  today: string;
  dismissedPromptIds: string[];
  /** Questions the owner snoozed with "still owe". Hidden until the re-ask date. */
  quietPromptIds?: string[];
}): { matches: AutoMatch[]; prompts: HelpPrompt[] } {
  const dismissed = new Set(input.dismissedPromptIds);
  const quiet = new Set(input.quietPromptIds ?? []);
  const namedPairs = candidatePairs(input.bills, input.transactions);
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

  for (const bill of input.bills) {
    if (bill.paidOutside) continue;
    if (bill.type !== "bill" || SETTLED.has(bill.status) || assignedBills.has(bill.instanceId)) continue;
    if (ambiguousBills.has(bill.instanceId)) continue;
    if (bill.dueDate >= input.today) continue;
    const id = `unmatched:${bill.instanceId}`;
    if (dismissed.has(id) || quiet.has(id)) continue;
    const charges = viablePairs(
      namedPairs.filter(
        (pair) =>
          pair.bill.instanceId === bill.instanceId &&
          !assignedTxns.has(pair.txn.id) &&
          !ambiguousTxns.has(pair.txn.id)
      )
    )
      .sort(
        (a, b) =>
          a.amountDiff - b.amountDiff ||
          a.dayDiff - b.dayDiff ||
          a.txn.date.localeCompare(b.txn.date) ||
          a.txn.id.localeCompare(b.txn.id)
      )
      .slice(0, QUESTION_CHARGE_LIMIT);
    const seen = new Set<string>();
    const chargeChoices: HelpChoice[] = [];
    for (const pair of charges) {
      if (seen.has(pair.txn.id)) continue;
      seen.add(pair.txn.id);
      chargeChoices.push(chargeChoice(bill, pair.txn));
    }
    prompts.push({
      id,
      reason: "unmatched_past",
      title: `Did ${bill.name} (${money(bill.plannedAmount)}) get paid?`,
      detail: chargeChoices.length > 0
        ? `Due ${shortDate(bill.dueDate)}.`
        : `Due ${shortDate(bill.dueDate)}. No matching charge in the linked accounts.`,
      instanceId: bill.instanceId,
      choices: [
        ...chargeChoices,
        {
          id: "paid-elsewhere",
          label: "Yes, paid another way",
          action: "paid_elsewhere",
          commitmentId: bill.commitmentId,
          instanceId: bill.instanceId,
          dueDate: bill.dueDate,
        },
        {
          id: "still-owe",
          label: "Not yet, still owe it",
          action: "still_owe",
          commitmentId: bill.commitmentId,
          instanceId: bill.instanceId,
          dueDate: bill.dueDate,
        },
        {
          id: "skip",
          label: "Skip this month (not due, and not paid)",
          action: "skip",
          commitmentId: bill.commitmentId,
          instanceId: bill.instanceId,
          dueDate: bill.dueDate,
        },
      ],
    });
  }

  const dueOf = (prompt: HelpPrompt) =>
    prompt.choices.find((choice) => choice.dueDate)?.dueDate ?? prompt.instanceId ?? prompt.id;
  const ranked = prompts.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === "ambiguous" ? -1 : 1;
    return dueOf(a).localeCompare(dueOf(b)) || (a.instanceId ?? a.id).localeCompare(b.instanceId ?? b.id);
  });

  return { matches, prompts: ranked.slice(0, HELP_PROMPT_LIMIT) };
}
