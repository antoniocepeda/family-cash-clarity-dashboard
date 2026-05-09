import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { createAccount, createCommitment, resetUserData } from "@/lib/repositories/firestore";
import { format, addDays, startOfDay } from "date-fns";
import type { DecodedIdToken } from "firebase-admin/auth";

function nextMonday(): string {
  const today = startOfDay(new Date());
  const day = today.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  return format(addDays(today, daysUntilMonday), "yyyy-MM-dd");
}

function nextDueDate(dayOfMonth: number): string {
  const today = new Date();
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (thisMonth >= today) return format(thisMonth, "yyyy-MM-dd");
  return format(new Date(today.getFullYear(), today.getMonth() + 1, dayOfMonth), "yyyy-MM-dd");
}

async function handlePOST(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const body = await req.json().catch(() => ({}));
  await resetUserData(user.uid);
  const checking = await createAccount(user.uid, {
    name: "Main Checking",
    type: "checking",
    current_balance: body.checking_balance ?? 0,
    is_reserve: 0,
  });
  const checkingId = checking!.id;

  const rows = [
    ["Rent + Utilities Bundle", 2500, nextDueDate(3), "monthly", "critical", false, "bill"],
    ["Electricity", 350, nextDueDate(2), "monthly", "critical", false, "bill"],
    ["Internet", 100, nextDueDate(23), "monthly", "normal", false, "bill"],
    ["Car Note (VW)", 370, nextDueDate(14), "monthly", "critical", false, "bill"],
    ["T-Mobile (Nela)", 120, nextDueDate(21), "monthly", "normal", false, "bill"],
    ["Apple One", 38, nextDueDate(25), "monthly", "flexible", false, "bill"],
    ["YouTube Premium", 23, nextDueDate(28), "monthly", "flexible", false, "bill"],
    ["ChatGPT (Tony)", 20, nextDueDate(8), "monthly", "flexible", false, "bill"],
    ["ChatGPT (Nela)", 20, nextDueDate(22), "monthly", "flexible", false, "bill"],
    ["Disney + Hulu", 20, nextDueDate(13), "monthly", "flexible", false, "bill"],
    ["Discord", 6, nextDueDate(9), "monthly", "flexible", false, "bill"],
    ["Furbo", 7, nextDueDate(17), "monthly", "flexible", false, "bill"],
    ["Ring", 10, nextDueDate(2), "monthly", "flexible", false, "bill"],
    ["Nintendo", 5, nextDueDate(12), "monthly", "flexible", false, "bill"],
    ["Luca iPad Game", 7, nextDueDate(9), "monthly", "flexible", false, "bill"],
    ["Lucy Roblox", 8, nextDueDate(27), "monthly", "flexible", false, "bill"],
    ["Luca's Groceries", 60, nextMonday(), "weekly", "normal", false, "bill"],
    ["Groceries", 100, nextMonday(), "weekly", "normal", false, "bill"],
    ["Niko's Food", 55, nextDueDate(22), "biweekly", "normal", false, "bill"],
    ["Artemis' Food", 25, nextDueDate(27), "biweekly", "normal", false, "bill"],
    ["Gas", 30, nextDueDate(28), "biweekly", "normal", false, "bill"],
    ["Paycheck", 2000, nextDueDate(6), "biweekly", "critical", true, "income"],
    ["Oncall Pay", 250, nextDueDate(15), "every_45_days", "normal", true, "income"],
  ] as const;

  for (const [name, amount, due_date, recurrence_rule, priority, autopay, type] of rows) {
    await createCommitment(user.uid, { name, amount, due_date, recurrence_rule, priority, autopay: autopay ? 1 : 0, type, account_id: checkingId });
  }

  return NextResponse.json({ success: true, message: "Seed data loaded" });
}

export const POST = withAuth(handlePOST);
