import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { listInstancesForTrendPeriod, listRecurringCommitmentsForTrends } from "@/lib/repositories/firestore";
import { format, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import type { DecodedIdToken } from "firebase-admin/auth";

interface TrendPeriod {
  label: string;
  start: string;
  end: string;
  planned: number;
  actual: number;
}

async function handleGET(req: NextRequest, { user }: { user: DecodedIdToken }) {
  const { searchParams } = new URL(req.url);
  const commitmentId = searchParams.get("commitment_id") || searchParams.get("event_id") || undefined;
  const period = searchParams.get("period") || "weeks";
  const range = parseInt(searchParams.get("range") || "8", 10);
  const today = new Date();
  const commitments = await listRecurringCommitmentsForTrends(user.uid, commitmentId);

  const trends = [];
  for (const commitment of commitments) {
    const periods: TrendPeriod[] = [];
    for (let i = range - 1; i >= 0; i--) {
      const periodStart = period === "months"
        ? startOfMonth(subMonths(today, i))
        : startOfWeek(subWeeks(today, i), { weekStartsOn: 0 });
      const periodEnd = period === "months" ? endOfMonth(periodStart) : endOfWeek(periodStart, { weekStartsOn: 0 });
      const label = period === "months"
        ? format(periodStart, "MMM yyyy")
        : `${format(periodStart, "MMM d")} - ${format(periodEnd, "MMM d")}`;
      const start = format(periodStart, "yyyy-MM-dd");
      const end = format(periodEnd, "yyyy-MM-dd");
      const instances = await listInstancesForTrendPeriod(user.uid, commitment.id, start, end);
      periods.push({
        label,
        start,
        end,
        planned: instances.reduce((s, r) => s + r.planned_amount, 0),
        actual: instances.reduce((s, r) => s + r.allocated_amount, 0),
      });
    }
    const nonEmpty = periods.filter((p) => p.planned > 0 || p.actual > 0);
    const count = nonEmpty.length || 1;
    trends.push({
      commitment_id: commitment.id,
      commitment_name: commitment.name,
      commitment_type: commitment.type,
      recurrence_rule: commitment.recurrence_rule,
      periods,
      avg_planned: nonEmpty.reduce((s, p) => s + p.planned, 0) / count,
      avg_actual: nonEmpty.reduce((s, p) => s + p.actual, 0) / count,
      total_over: nonEmpty.filter((p) => p.actual > p.planned).reduce((s, p) => s + (p.actual - p.planned), 0),
      total_under: nonEmpty.filter((p) => p.actual < p.planned).reduce((s, p) => s + (p.planned - p.actual), 0),
    });
  }
  return NextResponse.json(trends);
}

export const GET = withAuth(handleGET);
