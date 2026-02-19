3. Add/adjust irregular expenses (appointments, school, subscriptions).
4. Review projected low-balance day and preempt (move money / defer flexible spend).

Success signal: Next 2 weeks have no unknown large hits.

───

Payday workflow (20–30 min)

1. Confirm paycheck cleared.
2. Fund next cycle’s critical bills first.
3. Assign reserve amounts for known obligations.
4. Recompute “True Available.”
5. Decide discretionary cap until next payday.

Success signal: Payday reduces stress immediately, not temporarily.

───

Monthly workflow (30–45 min)

1. Review missed/late payments.
2. Update recurring bills (new rates, cancelled services).
3. Identify one fixed cost to reduce.
4. Adjust safety thresholds (buffer target).

Success signal: Fewer surprises month-over-month.

───

6) Alerts & Warnings (high-signal only)

Keep alerts minimal and actionable.

Critical (red)

• Projected balance < $0 in next 14 days
• Bill due within 48h and not funded
• Overdue critical bill (rent, utilities, insurance, debt minimum)

Warning (yellow)

• Projected balance drops below buffer threshold (e.g., <$500)
• Large irregular expense coming within 7 days
• Paycheck expected but not logged by +1 day

Informational (blue/gray)

• 3-day view summary
• Weekly cashflow confidence score (optional)

Rule: Every alert must have a direct suggested action (“Move $X from savings,” “Delay flexible bill Y,” etc.).

───

7) What You’re Probably Not Thinking About (but should)

1. Cleared vs pending cash:
Bank UI lies by timing. Track both where possible; forecast from cleared + scheduled.
2. Autopay timing mismatch:
“Due date” ≠ “withdrawal date.” Store both if possible.
3. Annual/quarterly bills:
These nuke confidence if not represented. Add as recurring with long intervals.
4. Irregular income variance:
Use conservative expected income amount in projection.
5. Data trust decay:
If data is stale, you’ll stop using it. Add a “last updated” timestamp front-and-center.
6. Alert fatigue:
3 useful alerts beat 20 noisy ones.
7. Mobile-first glanceability:
If it’s not fast on phone, daily habit dies.

───

8) Realistic V1 Scope (build fast, avoid overengineering)

V1 scope boundary (hard line)

Build only:

• Accounts (manual balances)
• Recurring + one-time events (income/bills)
• 28-day projection
• Dashboard cards + risk alerts
• Simple reconcile flow

Do not build:

• Bank API sync at first
• Complex budget categories
• AI forecasting
• Multi-tenant architecture
• Fancy auth/permissions layers beyond basic household login

───

9) Suggested Tech Approach (practical)

Use what ships fastest for you. Best lean stack:

• Frontend: Next.js (or plain React if preferred)
• Backend/API: Next API routes or small Node service
• DB: SQLite for fast start, Postgres when needed
• Hosting: Docker on your home server/VPS
• Auth: Single household account initially

If you want ultra-fast no-friction build:

• Supabase self-host + simple React UI (if comfortable), otherwise keep it all local with SQLite.

───

10) Data Model (minimal)

Account

• id, name, type (checking/savings/cash), current_balance, updated_at

Event

• id, name, type (income/bill), amount, due_date, recurrence_rule (nullable), priority, autopay, account_id, active

ProjectionSnapshot (optional cache)

• id, date, projected_balance

Alert

• id, severity, message, action_text, created_at, resolved_at

───

11) UX Layout (single-screen first)

Top to bottom:

1. Cash Position strip (On-hand / Reserved / True Available)
2. Risk banner (if any)
3. Next Bills (7/14 days)
4. Projection chart (28 days)
5. Upcoming events table
6. Quick actions: Add bill, Mark paid, Reconcile balance

───

12) Success Metrics (first 30 days)

• Opened at least 5 days/week
• Forecast error (7-day) within ±10%
• Late/forgotten bills reduced
• Subjective stress score drops (quick weekly 1–10 check)
• “Can answer cash status in <30 sec” most days

───

13) Build Plan (2-week V1)

Week 1

• Data model + CRUD for accounts/events


• Dashboard cards
• Bills timeline
• Manual reconcile flow

Week 2

• Projection engine
• Alerts
• Mobile polish
• Seed data + real household data migration
• Daily workflow test for 5 consecutive days
