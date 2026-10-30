import assert from "node:assert/strict";
import test from "node:test";
import { amountWithinTolerance, learnBankTag, merchantScore, planReconciliation, type BankTxn, type OpenBill } from "./reconcile";

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
