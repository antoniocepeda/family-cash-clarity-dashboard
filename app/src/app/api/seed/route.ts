import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { format } from "date-fns";

function nextDueDate(dayOfMonth: number): string {
  const today = new Date();
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (thisMonth >= today) {
    return format(thisMonth, "yyyy-MM-dd");
  }
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth);
  return format(nextMonth, "yyyy-MM-dd");
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const checkingBalance = body.checking_balance ?? 0;

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare("DELETE FROM commitment_allocations").run();
  db.prepare("DELETE FROM commitment_instances").run();
  db.prepare("DELETE FROM ledger").run();
  db.prepare("DELETE FROM commitment_history").run();
  db.prepare("DELETE FROM commitments").run();
  db.prepare("DELETE FROM accounts").run();
  db.prepare("DELETE FROM alerts").run();

  const checkingId = uuid();
  db.prepare(
    "INSERT INTO accounts (id, name, type, current_balance, is_reserve, updated_at) VALUES (?,?,?,?,?,?)"
  ).run(checkingId, "Main Checking", "checking", checkingBalance, 0, now);

  const bills: { name: string; amount: number; due: string; recurrence: string; priority: string; autopay: boolean }[] = [
    { name: "Rent + Utilities Bundle", amount: 2500, due: nextDueDate(3), recurrence: "monthly", priority: "critical", autopay: false },
    { name: "Electricity", amount: 350, due: nextDueDate(2), recurrence: "monthly", priority: "critical", autopay: false },
    { name: "Internet", amount: 100, due: nextDueDate(23), recurrence: "monthly", priority: "normal", autopay: true },
    { name: "Car Note (VW)", amount: 370, due: nextDueDate(14), recurrence: "monthly", priority: "critical", autopay: true },
    { name: "T-Mobile (Nela)", amount: 120, due: nextDueDate(21), recurrence: "monthly", priority: "normal", autopay: true },
    { name: "Apple One", amount: 38, due: nextDueDate(25), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "YouTube Premium", amount: 36, due: nextDueDate(28), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "ChatGPT (Tony)", amount: 20, due: nextDueDate(8), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "ChatGPT (Nela)", amount: 20, due: nextDueDate(22), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Disney + Hulu", amount: 20, due: nextDueDate(13), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Discord", amount: 6, due: nextDueDate(9), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Furbo", amount: 7, due: nextDueDate(17), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Ring", amount: 10, due: "2026-03-02", recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Nintendo", amount: 5, due: nextDueDate(12), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Luca iPad Game", amount: 7, due: nextDueDate(9), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Lucy Roblox", amount: 8, due: nextDueDate(27), recurrence: "monthly", priority: "flexible", autopay: true },
    { name: "Luca's Groceries", amount: 60, due: nextDueDate(22), recurrence: "weekly", priority: "normal", autopay: false },
    { name: "Groceries", amount: 100, due: nextDueDate(22), recurrence: "weekly", priority: "normal", autopay: false },
    { name: "Niko's Food", amount: 55, due: nextDueDate(22), recurrence: "biweekly", priority: "normal", autopay: false },
    { name: "Artemis' Food", amount: 25, due: nextDueDate(27), recurrence: "biweekly", priority: "normal", autopay: false },
    { name: "Gas", amount: 30, due: nextDueDate(28), recurrence: "biweekly", priority: "normal", autopay: false },
  ];

  const income: { name: string; amount: number; due: string; recurrence: string; priority: string }[] = [
    { name: "Paycheck", amount: 2000, due: "2026-03-06", recurrence: "biweekly", priority: "critical" },
  ];

  for (const bill of bills) {
    db.prepare(
      `INSERT INTO commitments (id, name, type, amount, due_date, recurrence_rule, priority, autopay, account_id, active, paid)
       VALUES (?,?,?,?,?,?,?,?,?,1,0)`
    ).run(uuid(), bill.name, "bill", bill.amount, bill.due, bill.recurrence, bill.priority, bill.autopay ? 1 : 0, checkingId);
  }

  for (const inc of income) {
    db.prepare(
      `INSERT INTO commitments (id, name, type, amount, due_date, recurrence_rule, priority, autopay, account_id, active, paid)
       VALUES (?,?,?,?,?,?,?,?,?,1,0)`
    ).run(uuid(), inc.name, "income", inc.amount, inc.due, inc.recurrence, inc.priority, 0, checkingId);
  }

  return NextResponse.json({ success: true, message: "Seed data loaded" });
}
