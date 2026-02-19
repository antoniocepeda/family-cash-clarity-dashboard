import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addDays, addWeeks, addMonths, format, parseISO } from "date-fns";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as {
    id: string;
    recurrence_rule: string | null;
    due_date: string;
    amount: number;
    account_id: string | null;
    type: string;
  } | undefined;

  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (event.account_id) {
    const impact = event.type === "income" ? event.amount : -event.amount;
    db.prepare("UPDATE accounts SET current_balance = current_balance + ?, updated_at = datetime('now') WHERE id = ?")
      .run(impact, event.account_id);
  }

  if (event.recurrence_rule) {
    const base = parseISO(event.due_date);
    let next: Date;
    switch (event.recurrence_rule) {
      case "weekly": next = addDays(base, 7); break;
      case "biweekly": next = addWeeks(base, 2); break;
      case "monthly": next = addMonths(base, 1); break;
      case "quarterly": next = addMonths(base, 3); break;
      case "annual": next = addMonths(base, 12); break;
      default: next = addMonths(base, 1); break;
    }
    db.prepare("UPDATE events SET due_date = ?, paid = 0 WHERE id = ?")
      .run(format(next, "yyyy-MM-dd"), id);
  } else {
    db.prepare("UPDATE events SET paid = 1 WHERE id = ?").run(id);
  }

  return NextResponse.json({ success: true });
}
