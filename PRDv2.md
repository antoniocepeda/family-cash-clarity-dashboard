PRD: Transaction-to-Event Allocation (Partial Spend for Recurring Budgets)

1) Overview

Add a workflow so a single logged transaction can be split across one or more upcoming events (especially recurring weekly budgets like groceries).
Each split reduces the remaining amount on the next upcoming event instance instead of forcing a binary paid/unpaid toggle.

───

2) Problem Statement

Current model is event-level paid/unpaid + standalone ledger entries.
This breaks for real-world spending where one receipt covers multiple budget buckets (e.g., Costco run split across household + Luca groceries).

Pain today

• Mixed purchases can’t be represented cleanly.
• Marking event “paid” too early is wrong.
• Leaving event unpaid ignores partial spend.
• Projections drift from reality until manual correction.

───

3) Goals

1. Log one transaction and allocate dollars to multiple events.
2. Force full allocation (allocated total must equal transaction total).
3. Apply allocations to the next due open instance of each selected event.
4. Track event progress as allocated, remaining, and status.
5. Keep projections based on remaining event amount, not just original amount.

───

4) Non-Goals (for this release)

• No OCR receipt scanning.
• No category AI.
• No cross-account transfer logic changes.
• No retroactive reallocation across closed pay cycles (unless user manually edits transaction).

───

5) User Stories

1. As a user, I can log a $75 Costco transaction and split it as $50 household groceries + $25 Luca groceries.
2. As a user, I’m forced to assign all $75 before saving (no orphan spend).
3. As a user, I can see this week’s grocery event now has only the remaining amount left.
4. As a user, if remaining reaches $0, event auto-changes to “funded/spent” for that cycle.
5. As a user, my projection reflects reduced upcoming outflows immediately after logging.

───

6) Functional Requirements

6.1 Log Transaction (Enhanced)

• Existing fields remain: description, date, amount, account.
• New section: Allocate to Upcoming Events.
• User can add 1..N allocation lines:
• Event selector (only eligible upcoming events)
• Allocation amount
• Running totals shown:
• Transaction total
• Allocated total
• Unallocated remainder

6.2 Validation Rules

• Save disabled unless:
• allocated_total == transaction_amount (exact to cents)
• every allocation amount > 0
• selected event instances are open/active
• Prevent over-allocation:
• allocation to event instance cannot exceed its remaining amount (unless explicitly allow-overrun flag in future release)

6.3 Event Instance Targeting

• For recurring events, apply allocation to next due unpaid/unfunded instance.
• If current instance is fully funded, next allocation rolls to the next instance.
• Allocation does not jump to past instances by default.

6.4 Event Progress State

For each event instance, track:

• planned_amount
• allocated_amount
• remaining_amount = planned - allocated
• status:
• open (remaining > 0)
• funded (remaining = 0)
• overfunded (future optional)
• Existing paid boolean can be mapped/derived or deprecated later.

6.5 Projection Behavior

• Projection engine subtracts only remaining_amount for upcoming events.
• Already allocated amounts should no longer appear as future outflow.

6.6 Edit/Undo Behavior

• Editing or deleting a transaction should reverse and reapply allocation deltas.
• Must maintain idempotent recalculation to avoid drift.

───

7) UX Requirements

7.1 Log Modal UX

• “Split allocation” table with add-row button.
• Default suggestion rows:
• show top upcoming recurring essentials (e.g., Groceries, Luca Groceries).
• Clear error messaging:
• “$12.43 left to allocate”
• “Allocation exceeds remaining for Groceries by $5.00”

7.2 Upcoming Events Card

Show per event:

• planned amount
• allocated so far
• remaining this cycle
• progress bar (optional but recommended)

Example:

• Groceries (weekly): Planned $100, Allocated $50, Remaining $50

7.3 Quick Actions
• “Allocate remaining” helper button (future nice-to-have).
• Keep current “mark paid” but hide/disable when partial tracking is active, or redefine as “set remaining to 0”.

───

8) Data Model Changes (suggested)

New table: event_allocations

• id (uuid)
• transaction_id (fk ledger/transaction)
• event_instance_id (fk to occurrence/expanded event row)
• event_id (fk base event, optional denormalization)
• amount (decimal 10,2)
• created_at

Event instance tracking (choose one approach)

1. Preferred: explicit event_instances table for recurring expansions:

• id, event_id, due_date, planned_amount, allocated_amount, status

2. Interim: virtual instances in projection layer + persisted allocation ledger keyed by (event_id, due_date).

───

9) API Changes (example)

• POST /api/ledger
• accept payload:
• transaction fields
• allocations: [{ event_id or event_instance_id, amount }]
• GET /api/events
• include current instance fields: planned, allocated, remaining, status
• GET /api/projections
• projections based on remaining amounts
• PATCH /api/ledger/:id
• reallocate/edit transaction
• DELETE /api/ledger/:id
• rollback allocations

───

10) Edge Cases

1. Rounding cents: enforce currency-safe decimal math.
2. Duplicate submit: idempotency key or transaction lock.
3. Allocation to event with no open instance: block + message.
4. Overfunding:

• v1: block
• v2: allow carry-forward to next instance.

5. Event amount edited after allocations exist:

• recompute remaining; preserve allocation history.

6. Recurring event regenerated:

• stable instance identity must persist.

───

11) Success Metrics

• % transactions with allocations attached (target: >70% for grocery-like spend)
• Reduction in manual “mark paid” corrections
• Projection error complaints decrease
• Time-to-log transaction under 30 seconds median
• Zero balance drift bugs across edit/delete/reload

───

12) Rollout Plan

Phase 1 (MVP)

• Allocation on log transaction
• Required full split
• Remaining amount visible on events
• Projection uses remaining amounts

Phase 2

• Edit/reallocate UI polish
• Optional carry-forward on over-allocation
• Smart defaults by recent patterns

Phase 3

• Receipt import/OCR
• Rule-based auto-split suggestions

───

13) Acceptance Criteria (must pass)

1. Log $75 with splits $50 + $25 saves successfully.
2. Corresponding two upcoming event instances reduce remaining by exact amounts.
3. Projection for those dates updates immediately and correctly.
4. Attempt to save with partial allocation fails.
5. Attempt to allocate beyond remaining fails (v1).
6. Editing/deleting transaction correctly reverses/reapplies allocations.
