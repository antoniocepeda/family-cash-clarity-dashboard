import { differenceInCalendarDays, format, parseISO } from "date-fns";

export const DATE_WINDOW_DAYS = 10;
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
};

export type BankTxn = {
  id: string;
  name: string;
  amount: number;
  date: string;
  pending?: boolean;
  linked?: boolean;
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

export function merchantScore(billName: string, txnName: string) {
  const billTokens = tokens(billName);
  const txnTokens = new Set(tokens(txnName));
  let shared = 0;
  for (const token of billTokens) if (txnTokens.has(token)) shared += 1;
  if (shared > 0) return shared;

  const billCompact = compact(billName);
  const txnCompact = compact(txnName);
  if (billCompact.length >= 3 && txnCompact.includes(billCompact)) return 1;
  if (txnCompact.length >= 3 && billCompact.includes(txnCompact)) return 1;
  for (const token of billTokens) {
    if (token.length >= 4 && txnCompact.includes(token)) return 1;
  }
  return 0;
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

function candidatePairs(bills: OpenBill[], txns: BankTxn[], requireName: boolean): Pair[] {
  const pairs: Pair[] = [];
  for (const txn of txns) {
    if (txn.pending || txn.linked || txn.amount <= 0) continue;
    for (const bill of bills) {
      if (bill.type !== "bill" || SETTLED.has(bill.status)) continue;
      if (!withinDateWindow(bill.dueDate, txn.date)) continue;
      if (!amountWithinTolerance(bill.plannedAmount, txn.amount)) continue;
      const nameScore = merchantScore(bill.name, txn.name);
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

  let progressed = true;
  while (progressed) {
    progressed = false;
    const open = remaining();
    const byTxn = new Map<string, Pair[]>();
    for (const pair of open) {
      const group = byTxn.get(pair.txn.id) ?? [];
      group.push(pair);
      byTxn.set(pair.txn.id, group);
    }
    for (const group of byTxn.values()) {
      if (group.length !== 1) continue;
      const pair = group[0];
      const billPairs = open.filter((item) => item.bill.instanceId === pair.bill.instanceId);
      if (billPairs.length !== 1) continue;
      assignedBills.add(pair.bill.instanceId);
      assignedTxns.add(pair.txn.id);
      matches.push({
        commitmentId: pair.bill.commitmentId,
        instanceId: pair.bill.instanceId,
        dueDate: pair.bill.dueDate,
        transactionId: pair.txn.id,
        actualAmount: pair.txn.amount,
      });
      progressed = true;
    }
  }

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
    if (group.length < 2) continue;
    const txn = group[0].txn;
    const id = `ambiguous:${txnId}`;
    ambiguousTxns.add(txnId);
    if (dismissed.has(id)) continue;
    const uniqueBills = new Map(group.map((pair) => [pair.bill.instanceId, pair.bill]));
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
