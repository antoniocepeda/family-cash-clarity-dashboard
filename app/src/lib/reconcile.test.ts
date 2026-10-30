import assert from "node:assert/strict";
import test from "node:test";
import { amountWithinTolerance, learnBankTag, merchantScore, planReconciliation, resolveChoiceWork, restorePrompt, withoutPrompt, type BankTxn, type HelpPrompt, type OpenBill } from "./reconcile";

function bill(partial: Partial<OpenBill> & Pick<OpenBill, "instanceId" | "name" | "dueDate" | "plannedAmount">): OpenBill {
  return {
    commitmentId: partial.commitmentId ?? partial.instanceId,
    type: "bill",
    status: "planned",
    ...partial,
  };
}

function txn(partial: Partial<BankTxn> & Pick<BankTxn, "id" | "name" | "amount" | "date">): BankTxn {
  return { pending: false, linked: false, ...partial };
}

test("a different actual amount still matches the merchant inside the date window", () => {
  assert.equal(amountWithinTolerance(200, 246), true);
  assert.ok(merchantScore("Verizon", "VERIZON WIRELESS POS") > 0);

  const plan = planReconciliation({
    today: "2026-11-05",
    dismissedPromptIds: [],
    bills: [bill({ instanceId: "verizon_2026-11-02", name: "Verizon", dueDate: "2026-11-02", plannedAmount: 200 })],
    transactions: [txn({ id: "txn-1", name: "VERIZON WIRELESS POS", amount: 246, date: "2026-11-03" })],
  });

  assert.equal(plan.prompts.length, 0);
  assert.deepEqual(plan.matches, [{
    commitmentId: "verizon_2026-11-02",
    instanceId: "verizon_2026-11-02",
    dueDate: "2026-11-02",
    transactionId: "txn-1",
    actualAmount: 246,
  }]);
});

test("two plausible bills become a needs-your-help prompt instead of a guess", () => {
  const plan = planReconciliation({
    today: "2026-11-05",
    dismissedPromptIds: [],
    bills: [
      bill({ instanceId: "v1", commitmentId: "v", name: "Verizon", dueDate: "2026-11-02", plannedAmount: 200 }),
      bill({ instanceId: "v2", commitmentId: "vi", name: "Verizon Internet", dueDate: "2026-11-04", plannedAmount: 220 }),
    ],
    transactions: [txn({ id: "txn-1", name: "VERIZON WIRELESS", amount: 246, date: "2026-11-03" })],
  });

  assert.equal(plan.matches.length, 0);
  assert.equal(plan.prompts.length, 1);
  assert.equal(plan.prompts[0].reason, "ambiguous");
  assert.equal(plan.prompts[0].choices.filter((choice) => choice.action === "assign").length, 2);
});

test("a bank statement tag matches when the display name does not", () => {
  assert.equal(merchantScore("Internet", "XFINITY AUTOPAY POS"), 0);
  assert.ok(merchantScore("Internet", "XFINITY AUTOPAY POS", ["Xfinity", "COMCAST"]) >= 3);
  assert.ok(merchantScore("Internet", "COMCAST CABLE", ["Xfinity", "COMCAST"]) >= merchantScore("COMCAST", "COMCAST CABLE"));

  const plan = planReconciliation({
    today: "2026-11-05",
    dismissedPromptIds: [],
    bills: [bill({
      instanceId: "internet_2026-11-02",
      commitmentId: "internet",
      name: "Internet",
      dueDate: "2026-11-02",
      plannedAmount: 80,
      bankMatchTags: ["Xfinity", "COMCAST"],
    })],
    transactions: [txn({ id: "txn-x", name: "XFINITY AUTOPAY POS", amount: 89.99, date: "2026-11-03" })],
  });

  assert.equal(plan.prompts.length, 0);
  assert.equal(plan.matches[0]?.commitmentId, "internet");
  assert.equal(plan.matches[0]?.actualAmount, 89.99);
});

test("learning a match keeps existing tags and ignores payment noise", () => {
  assert.deepEqual(learnBankTag(["COMCAST"], "XFINITY AUTOPAY POS"), ["COMCAST", "XFINITY"]);
  assert.deepEqual(learnBankTag(["Xfinity"], "XFINITY AUTOPAY POS"), ["Xfinity"]);
  assert.deepEqual(learnBankTag(["COMCAST"], "POS DEBIT PAYMENT"), ["COMCAST"]);
  assert.deepEqual(learnBankTag(undefined, "COMCAST *CABLE"), ["COMCAST CABLE"]);
});

function chatGpt(instanceId: string, commitmentId: string, dueDate: string, accountHint?: string): OpenBill {
  return bill({
    instanceId,
    commitmentId,
    name: "ChatGPT",
    dueDate,
    plannedAmount: 20,
    bankMatchTags: ["ChatGPT"],
    accountHint,
  });
}

test("two identical subscriptions a couple of weeks apart match the nearer charge", () => {
  const bills = [
    chatGpt("gpt-a_2026-11-01", "gpt-a", "2026-11-01"),
    chatGpt("gpt-b_2026-11-15", "gpt-b", "2026-11-15"),
    chatGpt("gpt-a_2026-12-01", "gpt-a", "2026-12-01"),
    chatGpt("gpt-b_2026-12-15", "gpt-b", "2026-12-15"),
  ];
  const plan = planReconciliation({
    today: "2026-12-20",
    dismissedPromptIds: [],
    bills,
    transactions: [
      txn({ id: "nov-a", name: "OPENAI *CHATGPT", amount: 20, date: "2026-11-06" }),
      txn({ id: "nov-b", name: "OPENAI *CHATGPT", amount: 20, date: "2026-11-16" }),
      txn({ id: "dec-a", name: "OPENAI *CHATGPT", amount: 20, date: "2026-12-06" }),
      txn({ id: "dec-b", name: "OPENAI *CHATGPT", amount: 20, date: "2026-12-16" }),
    ],
  });

  assert.equal(plan.prompts.length, 0);
  const pairs = Object.fromEntries(plan.matches.map((match) => [match.transactionId, match.instanceId]));
  assert.deepEqual(pairs, {
    "nov-a": "gpt-a_2026-11-01",
    "nov-b": "gpt-b_2026-11-15",
    "dec-a": "gpt-a_2026-12-01",
    "dec-b": "gpt-b_2026-12-15",
  });
});

test("charges whose due dates are too close still ask which bill", () => {
  const plan = planReconciliation({
    today: "2026-11-10",
    dismissedPromptIds: [],
    bills: [
      chatGpt("gpt-a_2026-11-01", "gpt-a", "2026-11-01"),
      chatGpt("gpt-b_2026-11-08", "gpt-b", "2026-11-08"),
    ],
    transactions: [txn({ id: "mid", name: "OPENAI *CHATGPT", amount: 20, date: "2026-11-04" })],
  });

  assert.equal(plan.matches.length, 0);
  assert.equal(plan.prompts.length, 1);
  assert.equal(plan.prompts[0].reason, "ambiguous");
  assert.equal(plan.prompts[0].choices.filter((choice) => choice.action === "assign").length, 2);
});

test("an account hint picks the card when the dates are too close to call", () => {
  const plan = planReconciliation({
    today: "2026-11-10",
    dismissedPromptIds: [],
    bills: [
      chatGpt("gpt-a_2026-11-01", "gpt-a", "2026-11-01", "card-a"),
      chatGpt("gpt-b_2026-11-08", "gpt-b", "2026-11-08", "card-b"),
    ],
    transactions: [
      txn({ id: "on-a", name: "OPENAI *CHATGPT", amount: 20, date: "2026-11-04", accountId: "card-a" }),
      txn({ id: "on-b", name: "OPENAI *CHATGPT", amount: 20, date: "2026-11-05", accountId: "card-b", accountMask: "4242" }),
    ],
  });

  assert.equal(plan.prompts.length, 0);
  const pairs = Object.fromEntries(plan.matches.map((match) => [match.transactionId, match.instanceId]));
  assert.deepEqual(pairs, {
    "on-a": "gpt-a_2026-11-01",
    "on-b": "gpt-b_2026-11-08",
  });
});

test("a tap drops that prompt immediately and can put it back", () => {
  const prompts = [
    { id: "ambiguous:txn-1", title: "Which bill?" },
    { id: "unmatched:rent", title: "Rent was due" },
  ];
  const next = withoutPrompt(prompts, "ambiguous:txn-1");
  assert.deepEqual(next.map((prompt) => prompt.id), ["unmatched:rent"]);
  assert.deepEqual(restorePrompt(next, prompts[0]).map((prompt) => prompt.id), ["ambiguous:txn-1", "unmatched:rent"]);
  assert.equal(restorePrompt(next, prompts[1]).length, 1);
});

test("choosing a bill only assigns that transaction, and dismiss skips a past bill", () => {
  const ambiguous: HelpPrompt = {
    id: "ambiguous:txn-1",
    reason: "ambiguous",
    title: "Which bill?",
    detail: "",
    choices: [
      { id: "bill:internet_2026-11-02", label: "Internet", action: "assign", commitmentId: "internet", instanceId: "internet_2026-11-02", transactionId: "txn-1" },
      { id: "dismiss", label: "Not a bill", action: "dismiss" },
    ],
  };
  assert.deepEqual(resolveChoiceWork(ambiguous, "bill:internet_2026-11-02"), {
    action: "assign",
    commitmentId: "internet",
    instanceId: "internet_2026-11-02",
    transactionId: "txn-1",
  });
  assert.deepEqual(resolveChoiceWork(ambiguous, "dismiss"), { action: "dismiss" });

  const past: HelpPrompt = {
    id: "unmatched:rent_2026-10-01",
    reason: "unmatched_past",
    title: "Rent was due",
    detail: "",
    instanceId: "rent_2026-10-01",
    choices: [{ id: "dismiss", label: "Dismiss", action: "dismiss", instanceId: "rent_2026-10-01", commitmentId: "rent" }],
  };
  assert.deepEqual(resolveChoiceWork(past, "dismiss"), { action: "skip", instanceId: "rent_2026-10-01" });
});

test("a past bill with no payment is asked once and stays dismissed", () => {
  const bills = [bill({ instanceId: "rent_2026-10-01", name: "Rent", dueDate: "2026-10-01", plannedAmount: 2000 })];
  const first = planReconciliation({ today: "2026-11-01", dismissedPromptIds: [], bills, transactions: [] });
  assert.equal(first.prompts[0]?.id, "unmatched:rent_2026-10-01");
  assert.equal(first.prompts[0].choices.some((choice) => choice.label === "Dismiss"), true);

  const second = planReconciliation({
    today: "2026-11-01",
    dismissedPromptIds: ["unmatched:rent_2026-10-01"],
    bills,
    transactions: [],
  });
  assert.equal(second.prompts.length, 0);
});
