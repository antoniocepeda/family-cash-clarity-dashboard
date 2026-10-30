import assert from "node:assert/strict";
import test from "node:test";
import { format, parseISO } from "date-fns";
import { expandOccurrenceDates } from "./schedule";

function days(dates: Date[]) {
  return dates.map((date) => format(date, "yyyy-MM-dd"));
}

test("monthly bills continue past mid December through the horizon", () => {
  const dates = days(expandOccurrenceDates(
    { due_date: "2026-11-01", recurrence_rule: "monthly" },
    parseISO("2026-10-30"),
    parseISO("2027-08-01")
  ));

  assert.ok(dates.includes("2026-11-01"));
  assert.ok(dates.includes("2026-12-01"));
  assert.ok(dates.includes("2027-07-01"));
  assert.equal(dates.at(-1), "2027-08-01");
});

test("an end date stops the series", () => {
  const dates = days(expandOccurrenceDates(
    { due_date: "2026-11-01", recurrence_rule: "monthly", recurrence_end_date: "2026-12-15" },
    parseISO("2026-10-01"),
    parseISO("2027-06-01")
  ));

  assert.deepEqual(dates, ["2026-11-01", "2026-12-01"]);
});

test("a count includes occurrences before the visible window", () => {
  const dates = expandOccurrenceDates(
    { due_date: "2026-01-01", recurrence_rule: "monthly", recurrence_count: 2 },
    parseISO("2026-10-01"),
    parseISO("2027-01-01")
  );

  assert.deepEqual(dates, []);
});

test("a count of two keeps the first two occurrences", () => {
  const dates = days(expandOccurrenceDates(
    { due_date: "2026-11-01", recurrence_rule: "monthly", recurrence_count: 2 },
    parseISO("2026-10-01"),
    parseISO("2027-06-01")
  ));

  assert.deepEqual(dates, ["2026-11-01", "2026-12-01"]);
});
