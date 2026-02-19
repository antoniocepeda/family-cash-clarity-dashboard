# Cash Clarity — Knowledge Base

A practical guide to using your Family Cash Clarity Dashboard.

---

## Getting Started

### First Launch

When you start the app for the first time (`npm run dev` from the `app/` directory), it automatically loads demo data so you can explore the interface. The dashboard runs at **http://localhost:3000**.

### Entering Your Real Data

1. Navigate to **Manage** (top nav bar)
2. Scroll to **Danger Zone** at the bottom
3. Type `RESET` and click **Clear Everything** to wipe all demo data
4. Start adding your real accounts and events (see sections below)

---

## Core Concepts

### Cash Position (the three cards at the top)

| Card | What It Means |
|------|---------------|
| **Cash On-Hand** | Total balance across all non-reserve accounts (checking, cash). This is money you can actually touch. |
| **Reserved** | Total balance in accounts marked as "reserve" (emergency savings, etc.). Excluded from spending calculations. |
| **True Available** | What you actually have to work with — on-hand cash minus nothing yet. In future versions this will subtract committed/funded bills. |

### Events

An "event" is anything that moves money — a bill going out or income coming in. Each event has:

- **Type** — `bill` (money out) or `income` (money in)
- **Amount** — how much
- **Due Date** — when it hits
- **Recurrence** — one-time, weekly, biweekly, monthly, quarterly, or annual
- **Priority** — `critical` (rent, utilities, insurance), `normal` (phone, internet), or `flexible` (streaming, gym)
- **Autopay** — whether it drafts automatically (informational, helps you know what's hands-off)
- **Account** — which account this event is linked to

### Priority Levels

Use these consistently for the alerts to be useful:

| Priority | When to Use | Examples |
|----------|-------------|----------|
| **Critical** | Missing this causes real damage — late fees, service shutoff, credit hit | Rent, electric, car insurance, minimum debt payments, paychecks |
| **Normal** | Important but a day or two of delay won't cause harm | Phone bill, internet, groceries, gas |
| **Flexible** | Can be deferred or cancelled if cash is tight | Streaming, gym, dining out, subscriptions |

### Accounts

An account represents anywhere you hold money:

| Type | Examples |
|------|----------|
| **Checking** | Primary checking, joint checking |
| **Savings** | Emergency fund, vacation savings |
| **Cash** | Cash on hand, petty cash |
| **Credit** | Credit card balances (track as negative balance if desired) |

Mark savings/emergency accounts as **Reserve** so they're excluded from your "True Available" number. This prevents you from mentally spending your safety net.

---

## The Dashboard

### Layout (top to bottom)

1. **Cash Position Strip** — your three key numbers at a glance
2. **Risk Alerts** — red/amber banners only appear when something needs attention
3. **Next 7 Days** — sidebar showing what's coming in and going out this week
4. **28-Day Projection Chart** — visual forecast of your balance over the next 4 weeks
5. **Upcoming Events Table** — all active events sorted by date, with Mark Paid buttons
6. **Quick Actions** — shortcuts to add events, reconcile, or add accounts

### Reading the Projection Chart

- **Blue line** — your projected balance over 28 days
- **Red dashed line** — the $0 danger line. If the blue line crosses this, you'll be negative.
- **Amber dashed line** — the $500 buffer threshold. Dropping below this triggers a warning.
- **Hover** over any point to see the exact balance and which events hit that day.
- Drops in the line = bills going out. Jumps up = income coming in.

### Understanding Alerts

Alerts only show when something needs your attention. Each alert includes a suggested action.

| Severity | Trigger | Example |
|----------|---------|---------|
| **Critical** (red) | Balance projected to go negative within 14 days | "Projected balance goes negative ($-230) on Mar 5" → Move funds from savings |
| **Critical** (red) | Bill due within 48 hours and not on autopay | "Rent ($1,850) due within 48 hours" → Schedule payment |
| **Critical** (red) | Overdue critical bill | "Overdue critical bill: Electric ($145)" → Pay immediately |
| **Warning** (amber) | Balance drops below $500 buffer | "Balance drops below $500 on Feb 28" → Defer flexible expenses |

If you see **"All clear"** in green — you're good. No action needed.

---

## Managing Data

### The Manage Page

Access via the **Manage** link in the top navigation bar.

Two tabs:

#### Accounts Tab
- View all accounts with name, type, balance, reserve status, and last updated date
- **+ Add Account** — opens an inline form at the top
- **Edit** — click to enter inline editing mode for any account (change name, type, balance, reserve flag)
- **Delete** — removes the account (events linked to it will lose their account reference)

#### Events Tab
- View all bills and income sorted by due date
- **+ Add Event** — opens an inline form with all fields
- **Edit** — inline editing for name, type, amount, due date, recurrence, priority, autopay
- **Delete** — permanently removes the event
- Color-coded dots: green = income, red = bill
- Badges show priority level, autopay status, and paid state

### Marking Events as Paid

On the **Dashboard**, each event row has a **Mark Paid** button. When you click it:

- **One-time events** — marked as paid and grayed out
- **Recurring events** — the due date advances to the next occurrence automatically (e.g., a monthly bill due Feb 23 becomes due Mar 23)
- **Account balance** — if the event is linked to an account, the balance adjusts (bills subtract, income adds)

### Reconciling Balances

Your projected balance will drift from reality over time. Use **Reconcile Balance** (dashboard quick action or manage page) to sync:

1. Open your bank app and note the actual balance
2. Click **Reconcile Balance**
3. Select the account and enter the real number
4. The system updates immediately and recalculates all projections

**Tip:** Do this at least every few days. The PRD calls out "data trust decay" — if numbers feel stale, you'll stop checking.

---

## Daily Workflows

### Quick Morning Check (2–5 minutes)

1. Open the dashboard
2. Glance at **Cash On-Hand** and **True Available**
3. Check for any **red or amber alerts** — follow the suggested actions
4. Scan the **Next 7 Days** sidebar for anything coming up
5. Done. You know your cash status.

### Weekly Planning Session (15–20 minutes)

1. Open the **28-Day Projection Chart** — look for any dips below the buffer or $0 line
2. Review the **Upcoming Events** table for the next 14 days
3. Add or adjust any irregular expenses (appointments, subscriptions, one-time costs)
4. If the projection shows a dangerous low point, decide now: move money or defer a flexible bill
5. **Reconcile** your main account balance with your bank

**Success signal:** The next 2 weeks have no unknown large hits.

### Payday Workflow (20–30 minutes)

1. Confirm paycheck cleared — check your bank, then **Reconcile** the account
2. Review the **Next 7 Days** and **Upcoming Events** — fund critical bills first
3. Look at the projection chart to see how the new income changes the picture
4. Decide your discretionary spending cap until next payday

**Success signal:** Payday reduces stress immediately, not temporarily.

### Monthly Review (30–45 minutes)

1. Go to **Manage > Events** — review all active events
2. Update any changed amounts (new rates, price increases)
3. Delete cancelled services
4. Add any new recurring bills
5. Look for one fixed cost to reduce
6. **Reconcile** all accounts

**Success signal:** Fewer surprises month-over-month.

---

## Tips & Best Practices

### Setting Up Accounts
- Create one account per real bank account or cash stash
- Mark emergency/savings accounts as **Reserve** — this keeps your "True Available" honest
- Update balances when you first set up, then reconcile regularly

### Setting Up Events
- Start with your biggest/most critical bills: rent/mortgage, utilities, insurance, debt payments
- Add all recurring income with actual pay dates
- Don't forget: annual/quarterly bills (car registration, insurance premiums) — these are the ones that "nuke confidence" if they surprise you
- Use **One-time** for known upcoming expenses (dentist, car repair, etc.)

### Autopay Dates vs Due Dates
The app stores the due date, but remember: autopay withdrawal dates don't always match the due date. If your electric bill is due the 15th but autopay pulls on the 12th, enter the 12th. Track when money actually moves, not when the bill says it's due.

### Keeping Data Fresh
- Reconcile your main checking account every 2–3 days
- The dashboard shows "Updated" timestamps — if it's been more than a few days, reconcile
- Mark bills as paid when you pay them (or when autopay drafts)
- Delete or deactivate events that no longer apply

### When Cash Gets Tight
1. Look at the projection chart — find the lowest point
2. Check which events hit right before the low point
3. Ask: which of these are **flexible** and can be deferred?
4. Can you move money from a reserve account temporarily?
5. Can you accelerate any expected income?

---

## API Reference (for advanced users)

All data lives in a local SQLite database at `app/data/family-cash.db`. You can also interact directly via the API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/accounts` | GET | List all accounts |
| `/api/accounts` | POST | Create account `{name, type, current_balance, is_reserve}` |
| `/api/accounts` | PUT | Update account `{id, name, type, current_balance, is_reserve}` |
| `/api/accounts?id=xxx` | DELETE | Delete account |
| `/api/accounts/reconcile` | POST | Set actual balance `{id, actual_balance}` |
| `/api/events` | GET | List all active events |
| `/api/events` | POST | Create event `{name, type, amount, due_date, recurrence_rule, priority, autopay, account_id}` |
| `/api/events` | PUT | Update event (all fields + `id`) |
| `/api/events?id=xxx` | DELETE | Delete event |
| `/api/events/mark-paid` | POST | Mark event paid `{id}` — advances recurring dates |
| `/api/projections?days=28` | GET | Get projected daily balances |
| `/api/alerts` | GET | Get current alerts |
| `/api/seed` | POST | Load demo data (replaces everything) |
| `/api/reset` | POST | Delete all data |

### Recurrence Rules

Valid values for `recurrence_rule`:
- `weekly` — every 7 days
- `biweekly` — every 14 days
- `monthly` — same day each month
- `quarterly` — every 3 months
- `annual` — every 12 months
- `null` or omitted — one-time event

---

## Troubleshooting

### Dashboard shows "Loading..." forever
The dev server may not be running. Open a terminal in the `app/` directory and run `npm run dev`.

### Data looks stale or wrong
Reconcile your account balances. Click the refresh button in the top-right corner of the dashboard. If data is truly corrupted, use **Manage > Danger Zone > Clear Everything** and re-enter.

### Projection chart looks flat
You likely have no active events. Go to **Manage > Events** and add your bills and income.

### Alerts aren't showing
Alerts only appear for critical and warning conditions. If your balances are healthy and no bills are due soon, the "All clear" message is correct.

### Want to start completely over
1. Go to **Manage**
2. Scroll to **Danger Zone**
3. Type `RESET` and click **Clear Everything**
4. Start fresh by adding your real accounts and events
