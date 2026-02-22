import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { format, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

interface TrendPeriod {
  label: string;
  start: string;
  end: string;
  planned: number;
  actual: number;
}

interface EventTrend {
  event_id: string;
  event_name: string;
  event_type: string;
  recurrence_rule: string | null;
  periods: TrendPeriod[];
  avg_planned: number;
  avg_actual: number;
  total_over: number;
  total_under: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("event_id");
  const period = searchParams.get("period") || "weeks";
  const rangeStr = searchParams.get("range") || "8";
  const range = parseInt(rangeStr, 10);

  const db = getDb();
  const today = new Date();

  let events: { id: string; name: string; type: string; recurrence_rule: string | null }[];
  if (eventId) {
    const row = db.prepare("SELECT id, name, type, recurrence_rule FROM events WHERE id = ?").get(eventId) as typeof events[0] | undefined;
    events = row ? [row] : [];
  } else {
    events = db.prepare(
      "SELECT id, name, type, recurrence_rule FROM events WHERE active = 1 AND recurrence_rule IS NOT NULL"
    ).all() as typeof events;
  }

  const trends: EventTrend[] = [];

  for (const event of events) {
    const periods: TrendPeriod[] = [];

    for (let i = range - 1; i >= 0; i--) {
      let periodStart: Date;
      let periodEnd: Date;
      let label: string;

      if (period === "months") {
        const monthRef = subMonths(today, i);
        periodStart = startOfMonth(monthRef);
        periodEnd = endOfMonth(monthRef);
        label = format(periodStart, "MMM yyyy");
      } else {
        const weekRef = subWeeks(today, i);
        periodStart = startOfWeek(weekRef, { weekStartsOn: 0 });
        periodEnd = endOfWeek(weekRef, { weekStartsOn: 0 });
        label = `${format(periodStart, "MMM d")} - ${format(periodEnd, "MMM d")}`;
      }

      const startStr = format(periodStart, "yyyy-MM-dd");
      const endStr = format(periodEnd, "yyyy-MM-dd");

      const instanceRows = db.prepare(
        `SELECT planned_amount, allocated_amount
         FROM event_instances
         WHERE event_id = ? AND due_date >= ? AND due_date <= ?`
      ).all(event.id, startStr, endStr) as { planned_amount: number; allocated_amount: number }[];

      let planned = 0;
      let actual = 0;
      for (const row of instanceRows) {
        planned += row.planned_amount;
        actual += row.allocated_amount;
      }

      periods.push({ label, start: startStr, end: endStr, planned, actual });
    }

    const nonEmpty = periods.filter((p) => p.planned > 0 || p.actual > 0);
    const count = nonEmpty.length || 1;
    const avgPlanned = nonEmpty.reduce((s, p) => s + p.planned, 0) / count;
    const avgActual = nonEmpty.reduce((s, p) => s + p.actual, 0) / count;
    const totalOver = nonEmpty.filter((p) => p.actual > p.planned).reduce((s, p) => s + (p.actual - p.planned), 0);
    const totalUnder = nonEmpty.filter((p) => p.actual < p.planned).reduce((s, p) => s + (p.planned - p.actual), 0);

    trends.push({
      event_id: event.id,
      event_name: event.name,
      event_type: event.type,
      recurrence_rule: event.recurrence_rule,
      periods,
      avg_planned: avgPlanned,
      avg_actual: avgActual,
      total_over: totalOver,
      total_under: totalUnder,
    });
  }

  return NextResponse.json(trends);
}
