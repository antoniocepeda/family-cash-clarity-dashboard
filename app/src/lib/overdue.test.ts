import assert from "node:assert/strict";
import test from "node:test";
import { isPaidOutsideBill, outsideBillsToMark, unpaidPastDueDate } from "./overdue";

const today = "2026-11-16";

test("a paid occurrence is not overdue when the template date is still in the past", () => {
  const date = unpaidPastDueDate({
    type: "bill",
    paid: 0,
    due_date: "2026-01-13",
    instances: [
      { due_date: "2026-10-13", status: "paid", remaining_amount: 0 },
      { due_date: "2026-11-13", status: "paid", remaining_amount: 0 },
      { due_date: "2026-12-13", status: "planned", remaining_amount: 86.4 },
    ],
  }, today);

  assert.equal(date, null);
});

test("an unpaid past occurrence is overdue even if a later one is coming up", () => {
  const date = unpaidPastDueDate({
    type: "bill",
    paid: 0,
    due_date: "2026-01-13",
    instances: [
      { due_date: "2026-10-13", status: "paid", remaining_amount: 0 },
      { due_date: "2026-11-13", status: "planned", remaining_amount: 86.4 },
      { due_date: "2026-12-13", status: "planned", remaining_amount: 86.4 },
    ],
  }, today);

  assert.equal(date, "2026-11-13");
});

test("a rescheduled occurrence uses its effective due date", () => {
  const date = unpaidPastDueDate({
    type: "bill",
    paid: 0,
    due_date: "2026-11-01",
    instances: [
      { due_date: "2026-11-20", status: "planned", remaining_amount: 40 },
    ],
  }, today);

  assert.equal(date, null);
});

test("income and a settled one-time bill are not overdue", () => {
  assert.equal(unpaidPastDueDate({
    type: "income",
    paid: 0,
    due_date: "2026-11-01",
    instances: [{ due_date: "2026-11-01", status: "planned", remaining_amount: 100 }],
  }, today), null);

  assert.equal(unpaidPastDueDate({
    type: "bill",
    paid: 0,
    due_date: "2026-11-01",
    instances: [{ due_date: "2026-11-01", status: "funded", remaining_amount: 0 }],
  }, today), null);
});

test("a bill paid outside linked accounts is not an overdue alert", () => {
  assert.equal(unpaidPastDueDate({
    type: "bill",
    paid: 0,
    paid_outside: true,
    due_date: "2026-11-01",
    instances: [{ due_date: "2026-11-01", status: "planned", remaining_amount: 140 }],
  }, today), null);
  assert.equal(isPaidOutsideBill({ type: "bill", paid_outside: 1 }), true);
  assert.equal(isPaidOutsideBill({ type: "bill" }), false);
  assert.equal(isPaidOutsideBill({ type: "income", paid_outside: true }), false);
});

test("outside bills ask to be marked through the end of this month", () => {
  const items = outsideBillsToMark([
    {
      id: "tm",
      name: "T-Mobile",
      type: "bill",
      amount: 140,
      due_date: "2026-10-14",
      paid_outside: true,
      instances: [
        { due_date: "2026-10-14", status: "planned", planned_amount: 140 },
        { due_date: "2026-11-14", status: "planned", planned_amount: 140 },
        { due_date: "2026-12-14", status: "planned", planned_amount: 140 },
      ],
    },
    {
      id: "x",
      name: "X Premium",
      type: "bill",
      amount: 11,
      due_date: "2026-11-03",
      paid_outside: true,
      instances: [
        { due_date: "2026-11-03", status: "paid", planned_amount: 11, remaining_amount: 0 },
      ],
    },
    {
      id: "rent",
      name: "Rent",
      type: "bill",
      amount: 2000,
      due_date: "2026-11-01",
      instances: [{ due_date: "2026-11-01", status: "planned", planned_amount: 2000 }],
    },
  ], today);

  assert.deepEqual(items.map((item) => [item.name, item.dueDate]), [
    ["T-Mobile", "2026-10-14"],
    ["T-Mobile", "2026-11-14"],
  ]);
});

test("a rescheduled outside bill keeps the original instance id and edited amount", () => {
  const items = outsideBillsToMark([
    {
      id: "tm",
      name: "T-Mobile",
      type: "bill",
      amount: 140,
      due_date: "2026-11-01",
      paid_outside: true,
      instances: [
        {
          id: "tm_2026-11-01",
          due_date: "2026-11-16",
          status: "planned",
          planned_amount: 155,
        },
      ],
    },
  ], today);

  assert.equal(items.length, 1);
  assert.equal(items[0].instanceId, "tm_2026-11-01");
  assert.equal(items[0].dueDate, "2026-11-16");
  assert.equal(items[0].amount, 155);
});

test("without instances, an unpaid past template date is the fallback", () => {
  assert.equal(unpaidPastDueDate({
    type: "bill",
    paid: 0,
    due_date: "2026-11-01",
  }, today), "2026-11-01");

  assert.equal(unpaidPastDueDate({
    type: "bill",
    paid: 1,
    due_date: "2026-11-01",
  }, today), null);
});
