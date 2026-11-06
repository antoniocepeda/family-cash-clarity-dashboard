import assert from "node:assert/strict";
import test from "node:test";
import { computeSafeToSpend } from "./safe-spend";
import {
  householdCash,
  plaidTransactionDate,
  plaidTransactionLabel,
  projectionStartingBalance,
  shouldApplyPendingTransaction,
  visiblePending,
  type CashAccount,
} from "./cash-balance";

const xMoney: CashAccount = {
  id: "xmoney",
  type: "checking",
  current_balance: 856.38,
  available_balance: 823.92,
  is_reserve: 0,
};

const schwab: CashAccount = {
  id: "schwab",
  type: "checking",
  current_balance: 17.81,
  available_balance: 17.81,
  is_reserve: 0,
};

test("cash uses available balances and does not subtract a pending charge again", () => {
  const cash = householdCash([xMoney, schwab]);
  assert.equal(cash.amount, 841.73);
  assert.equal(cash.basis, "available");
  assert.equal(householdCash([xMoney, schwab], "posted").amount, 874.19);

  const pendingHeb = 83.35;
  const spend = computeSafeToSpend({
    cashOnHand: cash.amount,
    days: [],
    recurringIncomeIds: [],
    today: "2026-11-05",
    buffer: 100,
  });
  assert.equal(spend.safeToSpend, 741.73);
  assert.notEqual(spend.safeToSpend, Math.round((cash.amount - pendingHeb - 100) * 100) / 100);
  assert.equal(shouldApplyPendingTransaction(xMoney, true), false);
  assert.equal(projectionStartingBalance([xMoney, schwab], true), 841.73);
  assert.equal(projectionStartingBalance([xMoney, schwab], false), 874.19);
});

test("missing available balance falls back to the posted balance", () => {
  const manual: CashAccount = { id: "cash", type: "cash", current_balance: 40, available_balance: null, is_reserve: 0 };
  const cash = householdCash([manual, xMoney]);
  assert.equal(cash.amount, 863.92);
  assert.equal(cash.basis, "mixed");
  assert.equal(shouldApplyPendingTransaction(manual, true), true);
  assert.equal(shouldApplyPendingTransaction(manual, false), false);
});

test("a bank that sends no available balance keeps the posted total", () => {
  const onlyPosted: CashAccount = { type: "checking", current_balance: 100, available_balance: null };
  const cash = householdCash([onlyPosted]);
  assert.equal(cash.amount, 100);
  assert.equal(cash.basis, "current");
});

test("credit-card available credit is not treated as spendable cash", () => {
  const card: CashAccount = { id: "card", type: "credit", current_balance: 220, available_balance: 4780, is_reserve: 0 };
  const cash = householdCash([xMoney, card]);
  assert.equal(cash.amount, 1043.92);
  assert.equal(shouldApplyPendingTransaction(card, true), false);
});

test("reserve accounts stay out of spendable cash", () => {
  const savings: CashAccount = { type: "savings", current_balance: 500, available_balance: 500, is_reserve: 1 };
  const cash = householdCash([xMoney, savings]);
  assert.equal(cash.amount, 823.92);
  assert.equal(cash.reserved, 500);
  assert.equal(shouldApplyPendingTransaction(savings, true), false);
});

test("pending rows that disappeared are hidden, and the merchant label prefers Plaid's merchant name", () => {
  const rows = visiblePending([
    { id: "old", pending: true, removed: true, date: "2026-11-05", description: "Declined" },
    { id: "heb", pending: true, removed: false, date: "2026-11-05", description: "H-E-B" },
    { id: "posted", pending: false, removed: false, date: "2026-11-04", description: "Kroger" },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ["heb"]);
  assert.equal(plaidTransactionLabel({ name: "H-E-B 1234 AUSTIN TX", merchant_name: "H-E-B", date: "2026-11-05" }), "H-E-B");
  assert.equal(plaidTransactionLabel({ name: "CHECK 104", merchant_name: null, date: "2026-11-01" }), "CHECK 104");
  assert.equal(plaidTransactionDate({ date: "2026-11-06", authorized_date: "2026-11-05" }), "2026-11-05");
});
