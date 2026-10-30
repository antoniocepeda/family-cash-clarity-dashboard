import assert from "node:assert/strict";
import test from "node:test";
import { planDuplicateCleanup, planFutureDueDateEdit, type InstanceLite } from "./instance-edit";

const shell = (id: string, original: string, due = original, extra: Partial<InstanceLite> = {}): InstanceLite => ({
  id,
  original_due_date: original,
  due_date: due,
  allocated_amount: 0,
  status: "planned",
  ...extra,
});

test("moving a future due date from the 1st to the 2nd relocates the instance and drops the duplicate", () => {
  const plan = planFutureDueDateEdit({
    commitmentId: "rent",
    originalDueDate: "2026-11-01",
    nextDueDate: "2026-11-02",
    instances: [
      shell("rent_2026-10-01", "2026-10-01", "2026-10-01", { status: "paid", allocated_amount: 2000 }),
      shell("rent_2026-11-01", "2026-11-01"),
      shell("rent_2026-11-02", "2026-11-02"),
      shell("rent_2026-12-01", "2026-12-01"),
      shell("rent_2026-12-15", "2026-12-15", "2026-12-15", { edited_from_template: true }),
    ],
  });

  assert.equal(plan.moveFromId, "rent_2026-11-01");
  assert.equal(plan.moveToId, "rent_2026-11-02");
  assert.deepEqual(plan.deleteIds.sort(), ["rent_2026-11-02", "rent_2026-12-01"]);
});

test("duplicate rows on the same due date keep the edited instance on the new date id", () => {
  const plan = planDuplicateCleanup("rent", [
    shell("rent_2026-11-01", "2026-11-01", "2026-11-02", { edited_from_template: true }),
    shell("rent_2026-11-02", "2026-11-02", "2026-11-02"),
  ]);

  assert.deepEqual(plan.relocate, [{ fromId: "rent_2026-11-01", toId: "rent_2026-11-02" }]);
  assert.deepEqual(plan.deleteIds, []);
});
