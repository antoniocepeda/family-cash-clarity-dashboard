import assert from "node:assert/strict";
import test from "node:test";
import { buildOutlook, computeSafeToSpend, type SpendProjectionDay } from "./safe-spend";

const days: SpendProjectionDay[] = [
  {
    date: "2026-11-01",
    balance: 800,
    commitments: [{ name: "Phone", amount: 90, type: "bill", commitment_id: "phone", due_date: "2026-11-01" }],
  },
  {
    date: "2026-11-03",
    balance: 600,
    commitments: [{ name: "Power", amount: 200, type: "bill", commitment_id: "power", due_date: "2026-11-03" }],
  },
  {
    date: "2026-11-14",
    balance: 2100,
    commitments: [{ name: "Paycheck", amount: 1500, type: "income", commitment_id: "pay", due_date: "2026-11-14" }],
  },
  {
    date: "2026-11-28",
    balance: 2400,
    commitments: [{ name: "Paycheck", amount: 1500, type: "income", commitment_id: "pay", due_date: "2026-11-28" }],
  },
  {
    date: "2026-12-12",
    balance: 2700,
    commitments: [{ name: "Paycheck", amount: 1500, type: "income", commitment_id: "pay", due_date: "2026-12-12" }],
  },
];

test("safe to spend subtracts bills due before payday and a buffer", () => {
  const result = computeSafeToSpend({
    cashOnHand: 1000,
    days,
    recurringIncomeIds: ["pay"],
    today: "2026-11-01",
    buffer: 100,
  });

  assert.equal(result.paycheckDate, "2026-11-14");
  assert.equal(result.billsTotal, 290);
  assert.equal(result.safeToSpend, 610);
  assert.equal(result.canSpend, true);
  assert.deepEqual(result.bills.map((bill) => bill.name), ["Phone", "Power"]);
});

test("safe to spend is no when the buffer is not covered", () => {
  const result = computeSafeToSpend({
    cashOnHand: 350,
    days,
    recurringIncomeIds: ["pay"],
    today: "2026-11-01",
    buffer: 100,
  });

  assert.equal(result.safeToSpend, -40);
  assert.equal(result.canSpend, false);
});

test("outlook covers the next three paychecks and notices cash rising", () => {
  const outlook = buildOutlook({
    startingCash: 1000,
    days,
    recurringIncomeIds: ["pay"],
  });

  assert.equal(outlook.paychecks.length, 3);
  assert.equal(outlook.paychecks[2].date, "2026-12-12");
  assert.equal(outlook.covered, true);
  assert.equal(outlook.trend, "up");
  assert.equal(outlook.onTrack, true);
  assert.equal(outlook.shortfallDate, null);
});
