import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { format, addDays } from "date-fns";

export async function POST() {
  const db = getDb();
  const now = new Date().toISOString();
  const today = format(new Date(), "yyyy-MM-dd");

  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM accounts").run();
  db.prepare("DELETE FROM alerts").run();

  const checkingId = uuid();
  const savingsId = uuid();

  db.prepare(
    "INSERT INTO accounts (id, name, type, current_balance, is_reserve, updated_at) VALUES (?,?,?,?,?,?)"
  ).run(checkingId, "Main Checking", "checking", 3420.50, 0, now);

  db.prepare(
    "INSERT INTO accounts (id, name, type, current_balance, is_reserve, updated_at) VALUES (?,?,?,?,?,?)"
  ).run(savingsId, "Emergency Savings", "savings", 2100.00, 1, now);

  const cashId = uuid();
  db.prepare(
    "INSERT INTO accounts (id, name, type, current_balance, is_reserve, updated_at) VALUES (?,?,?,?,?,?)"
  ).run(cashId, "Cash on Hand", "cash", 85.00, 0, now);

  const bills = [
    { name: "Rent", amount: 1850, due: addDays(new Date(), 5), recurrence: "monthly", priority: "critical", autopay: false },
    { name: "Electric Bill", amount: 145, due: addDays(new Date(), 8), recurrence: "monthly", priority: "critical", autopay: true },
    { name: "Internet", amount: 79.99, due: addDays(new Date(), 12), recurrence: "monthly", priority: "normal", autopay: true },
    { name: "Car Insurance", amount: 210, due: addDays(new Date(), 15), recurrence: "monthly", priority: "critical", autopay: true },
    { name: "Phone Bill", amount: 95, due: addDays(new Date(), 10), recurrence: "monthly", priority: "normal", autopay: true },
    { name: "Streaming Services", amount: 45.97, due: addDays(new Date(), 3), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Grocery Budget", amount: 600, due: addDays(new Date(), 1), recurrence: "biweekly", priority: "critical", autopay: false },
    { name: "Gas / Transport", amount: 180, due: addDays(new Date(), 7), recurrence: "biweekly", priority: "normal", autopay: false },
    { name: "Kids School Lunch", amount: 75, due: addDays(new Date(), 2), recurrence: "weekly", priority: "normal", autopay: false },
    { name: "Gym Membership", amount: 49.99, due: addDays(new Date(), 20), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Dentist Appointment", amount: 250, due: addDays(new Date(), 18), recurrence: null, priority: "normal", autopay: false },
    { name: "Annual Car Registration", amount: 285, due: addDays(new Date(), 25), recurrence: null, priority: "critical", autopay: false },
  ];

  const income = [
    { name: "Paycheck (Primary)", amount: 2850, due: addDays(new Date(), 6), recurrence: "biweekly", priority: "critical" },
    { name: "Paycheck (Partner)", amount: 1950, due: addDays(new Date(), 13), recurrence: "biweekly", priority: "critical" },
    { name: "Side Gig Payment", amount: 400, due: addDays(new Date(), 22), recurrence: null, priority: "normal" },
  ];

  for (const bill of bills) {
    db.prepare(
      `INSERT INTO events (id, name, type, amount, due_date, recurrence_rule, priority, autopay, account_id, active, paid)
       VALUES (?,?,?,?,?,?,?,?,?,1,0)`
    ).run(uuid(), bill.name, "bill", bill.amount, format(bill.due, "yyyy-MM-dd"), bill.recurrence, bill.priority, bill.autopay ? 1 : 0, checkingId);
  }

  for (const inc of income) {
    db.prepare(
      `INSERT INTO events (id, name, type, amount, due_date, recurrence_rule, priority, autopay, account_id, active, paid)
       VALUES (?,?,?,?,?,?,?,?,?,1,0)`
    ).run(uuid(), inc.name, "income", inc.amount, format(inc.due, "yyyy-MM-dd"), inc.recurrence, inc.priority, 0, checkingId);
  }

  return NextResponse.json({ success: true, message: "Seed data loaded" });
}
