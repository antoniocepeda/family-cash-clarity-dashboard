import assert from "node:assert/strict";
import test from "node:test";
import { amountWithinTolerance, cleanMerchantTag, learnBankTag, merchantScore, planReconciliation, resolveChoiceWork, restorePrompt, withoutPrompt, type BankTxn, type HelpPrompt, type OpenBill } from "./reconcile";

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
    transactions: [txn({ id: "txn-1", name: "VERIZON WIRELESS", amount: 210, date: "2026-11-03" })],
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

test("a pending charge is not matched or offered as a bill payment", () => {
  const plan = planReconciliation({
    today: "2026-11-05",
    dismissedPromptIds: [],
    bills: [bill({ instanceId: "groceries_2026-11-01", name: "Groceries", dueDate: "2026-11-01", plannedAmount: 80 })],
    transactions: [txn({ id: "heb", name: "H-E-B", amount: 83.35, date: "2026-11-04", pending: true })],
  });

  assert.equal(plan.matches.length, 0);
  assert.equal(plan.prompts.some((prompt) => prompt.choices.some((choice) => choice.transactionId === "heb")), false);
});

test("a past bill with no payment is asked once and stays dismissed", () => {
  const bills = [bill({ instanceId: "rent_2026-10-01", name: "Rent", dueDate: "2026-10-01", plannedAmount: 2000 })];
  const first = planReconciliation({ today: "2026-11-01", dismissedPromptIds: [], bills, transactions: [] });
  assert.equal(first.prompts[0]?.id, "unmatched:rent_2026-10-01");
  assert.equal(first.prompts[0].title, "Did Rent ($2,000.00) get paid?");
  assert.equal(first.prompts[0].choices.some((choice) => choice.id === "skip"), true);
  assert.equal(first.prompts[0].choices.some((choice) => choice.label === "Dismiss"), false);

  const second = planReconciliation({
    today: "2026-11-01",
    dismissedPromptIds: ["unmatched:rent_2026-10-01"],
    bills,
    transactions: [],
  });
  assert.equal(second.prompts.length, 0);
});

test("an overdue bill only offers name-matched charges, closest amount first, at most 3", () => {
  const groceries = Array.from({ length: 12 }, (_, index) => txn({
    id: `grocery-${index}`,
    name: index % 2 === 0 ? "H-E-B" : "STARBUCKS",
    amount: 130 + index,
    date: "2026-11-04",
  }));
  const plan = planReconciliation({
    today: "2026-11-12",
    dismissedPromptIds: [],
    bills: [bill({
      instanceId: "phone_2026-11-03",
      commitmentId: "phone",
      name: "T-Mobile",
      dueDate: "2026-11-03",
      plannedAmount: 140,
      bankMatchTags: ["TMOBILE"],
    })],
    transactions: [
      ...groceries,
      txn({ id: "tm-far", name: "TMOBILE PCS", amount: 140, date: "2026-11-06" }),
      txn({ id: "tm-close", name: "TMOBILE*AUTOPAY", amount: 140, date: "2026-11-03" }),
      txn({ id: "tm-mid", name: "T-MOBILE", amount: 140, date: "2026-11-02" }),
      txn({ id: "tm-later", name: "TMOBILE STORE", amount: 140, date: "2026-11-05" }),
    ],
  });

  assert.equal(plan.matches.length, 0);
  assert.equal(plan.prompts.length, 1);
  assert.equal(plan.prompts[0].title, "Did T-Mobile ($140.00) get paid?");
  const charges = plan.prompts[0].choices.filter((choice) => choice.action === "assign");
  assert.deepEqual(charges.map((choice) => choice.transactionId), ["tm-close", "tm-mid", "tm-later"]);
  assert.equal(charges.every((choice) => choice.label.startsWith("Yes, this charge")), true);
  assert.equal(plan.prompts[0].choices.some((choice) => /H-E-B|STARBUCKS/i.test(choice.label)), false);
  assert.deepEqual(
    plan.prompts[0].choices.filter((choice) => choice.action !== "assign").map((choice) => choice.id),
    ["paid-elsewhere", "still-owe", "skip"],
  );
});

test("a small bill does not offer or auto-match a charge outside $5 or 10 percent", () => {
  assert.equal(amountWithinTolerance(20, 24.5), true);
  assert.equal(amountWithinTolerance(20, 26), false);
  assert.equal(amountWithinTolerance(200, 246), true);

  const plan = planReconciliation({
    today: "2026-11-10",
    dismissedPromptIds: [],
    bills: [bill({ instanceId: "x_2026-11-02", commitmentId: "x", name: "X Premium", dueDate: "2026-11-02", plannedAmount: 11 })],
    transactions: [txn({ id: "big", name: "X CORP PREMIUM", amount: 40, date: "2026-11-03" })],
  });

  assert.equal(plan.matches.length, 0);
  assert.equal(plan.prompts[0].choices.filter((choice) => choice.action === "assign").length, 0);
  assert.match(plan.prompts[0].detail, /No matching charge/);
});

test("close due dates match the closer amount instead of asking", () => {
  const plan = planReconciliation({
    today: "2026-11-02",
    dismissedPromptIds: [],
    bills: [
      bill({ instanceId: "a_2026-11-02", commitmentId: "a", name: "Verizon", dueDate: "2026-11-02", plannedAmount: 130 }),
      bill({ instanceId: "b_2026-11-04", commitmentId: "b", name: "Verizon", dueDate: "2026-11-04", plannedAmount: 150 }),
    ],
    transactions: [txn({ id: "charge", name: "VERIZON WIRELESS", amount: 148, date: "2026-11-03" })],
  });

  assert.equal(plan.prompts.length, 0);
  assert.equal(plan.matches[0]?.instanceId, "b_2026-11-04");
  assert.equal(plan.matches[0]?.transactionId, "charge");
});

test("a due date that leads by 4 days still wins over a closer amount", () => {
  const plan = planReconciliation({
    today: "2026-11-20",
    dismissedPromptIds: [],
    bills: [bill({ instanceId: "v_2026-11-04", name: "Verizon", dueDate: "2026-11-04", plannedAmount: 80 })],
    transactions: [
      txn({ id: "sooner", name: "VERIZON WIRELESS", amount: 110, date: "2026-11-05" }),
      txn({ id: "later", name: "VERIZON WIRELESS", amount: 80, date: "2026-11-10" }),
    ],
  });

  assert.equal(plan.matches[0]?.transactionId, "sooner");
});

test("a bill paid outside linked accounts is not matched or asked about", () => {
  const plan = planReconciliation({
    today: "2026-11-10",
    dismissedPromptIds: [],
    bills: [bill({
      instanceId: "tm_2026-11-02",
      name: "T-Mobile",
      dueDate: "2026-11-02",
      plannedAmount: 140,
      paidOutside: true,
      bankMatchTags: ["TMOBILE"],
    })],
    transactions: [txn({ id: "tm", name: "TMOBILE*AUTOPAY", amount: 140, date: "2026-11-02" })],
  });

  assert.equal(plan.matches.length, 0);
  assert.equal(plan.prompts.length, 0);
});

test("still owe stays quiet until the question is allowed back", () => {
  const bills = [bill({ instanceId: "rent_2026-10-01", name: "Rent", dueDate: "2026-10-01", plannedAmount: 2000 })];
  const quiet = planReconciliation({
    today: "2026-11-05",
    dismissedPromptIds: [],
    quietPromptIds: ["unmatched:rent_2026-10-01"],
    bills,
    transactions: [],
  });
  assert.equal(quiet.prompts.length, 0);

  const again = planReconciliation({
    today: "2026-11-09",
    dismissedPromptIds: [],
    quietPromptIds: [],
    bills,
    transactions: [],
  });
  assert.equal(again.prompts[0]?.id, "unmatched:rent_2026-10-01");
});

test("paid another way, still owe, and skip are one-tap answers", () => {
  const past: HelpPrompt = {
    id: "unmatched:rent_2026-10-01",
    reason: "unmatched_past",
    title: "Did Rent ($2,000.00) get paid?",
    detail: "",
    instanceId: "rent_2026-10-01",
    choices: [
      { id: "paid-elsewhere", label: "Yes, paid another way", action: "paid_elsewhere", commitmentId: "rent", instanceId: "rent_2026-10-01" },
      { id: "still-owe", label: "Not yet, still owe it", action: "still_owe", instanceId: "rent_2026-10-01" },
      { id: "skip", label: "Skip this month (not due, and not paid)", action: "skip", instanceId: "rent_2026-10-01" },
    ],
  };
  assert.deepEqual(resolveChoiceWork(past, "paid-elsewhere"), {
    action: "paid_elsewhere",
    commitmentId: "rent",
    instanceId: "rent_2026-10-01",
  });
  assert.deepEqual(resolveChoiceWork(past, "still-owe"), { action: "still_owe", instanceId: "rent_2026-10-01" });
  assert.deepEqual(resolveChoiceWork(past, "skip"), { action: "skip", instanceId: "rent_2026-10-01" });
});

test("a plain shared merchant word is not saved as a bank tag", () => {
  assert.equal(cleanMerchantTag("APPLE.COM/BILL"), "APPLE");
  assert.deepEqual(learnBankTag(["Xfinity"], "APPLE.COM/BILL"), ["Xfinity"]);
  assert.deepEqual(learnBankTag([], "PREMIUM", ["X Premium", "YouTube Premium"]), []);
  assert.deepEqual(learnBankTag([], "APPLE MUSIC", ["iCloud"]), ["APPLE MUSIC"]);
  assert.deepEqual(learnBankTag([], "XFINITY AUTOPAY POS"), ["XFINITY"]);
});
