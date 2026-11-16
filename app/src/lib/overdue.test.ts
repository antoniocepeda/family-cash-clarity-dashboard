import assert from "node:assert/strict";
import test from "node:test";
import { unpaidPastDueDate } from "./overdue";

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
