import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureInstance } from "@/lib/instances";
import { addDays, addWeeks, addMonths, format, parseISO } from "date-fns";

export async function POST(req: NextRequest) {
  const { id, instance_due_date } = await req.json();
  if (!id)
    return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = getDb();
  const event = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as
    | {
        id: string;
        name: string;
        recurrence_rule: string | null;
        due_date: string;
        amount: number;
        account_id: string | null;
        type: string;
      }
    | undefined;

  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });

  const targetDueDate = instance_due_date || event.due_date;

  const run = db.transaction(() => {
    const instanceId = ensureInstance(db, event.id, targetDueDate, event.amount);

    db.prepare(
      "UPDATE event_instances SET status = 'funded' WHERE id = ?"
    ).run(instanceId);

    if (event.recurrence_rule) {
      const base = parseISO(event.due_date);
      let next: Date;
      switch (event.recurrence_rule) {
        case "weekly":
          next = addDays(base, 7);
          break;
        case "biweekly":
          next = addWeeks(base, 2);
          break;
        case "monthly":
          next = addMonths(base, 1);
          break;
        case "quarterly":
          next = addMonths(base, 3);
          break;
        case "annual":
          next = addMonths(base, 12);
          break;
        default:
          next = addMonths(base, 1);
          break;
      }
      db.prepare(
        "UPDATE events SET due_date = ?, paid = 0, actual_amount = NULL, paid_date = NULL WHERE id = ?"
      ).run(format(next, "yyyy-MM-dd"), id);
    } else {
      db.prepare(
        "UPDATE events SET paid = 1, paid_date = ? WHERE id = ?"
      ).run(format(new Date(), "yyyy-MM-dd"), id);
    }
  });

  try {
    run();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Rollover failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
