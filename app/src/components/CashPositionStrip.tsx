"use client";

import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Account, CommitmentWithInstances, ProjectionDay } from "@/lib/types";

interface Props {
  accounts: Account[];
  commitments: CommitmentWithInstances[];
  projection: ProjectionDay[];
  lastUpdated: string;
}

const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

function getMonthlySafetyAmount(projection: ProjectionDay[]) {
  const firstDay = projection[0];
  if (!firstDay) return null;

  const startDate = parseISO(firstDay.date);
  const monthlyCapacities = projection.map((day) => {
    const daysFromStart = differenceInCalendarDays(parseISO(day.date), startDate);
    const monthsAvailable = Math.floor(daysFromStart / AVERAGE_DAYS_PER_MONTH) + 1;
    return day.balance / monthsAvailable;
  });

  return Math.min(...monthlyCapacities);
}

function getSafeToSpend(accounts: Account[], commitments: CommitmentWithInstances[], projection: ProjectionDay[]) {
  const onHand = accounts
    .filter((a) => !a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);
  const today = format(new Date(), "yyyy-MM-dd");

  const recurringIncomeIds = new Set(
    commitments
      .filter((commitment) => commitment.active && commitment.type === "income" && commitment.recurrence_rule)
      .map((commitment) => commitment.id)
  );

  const nextPayday = projection
    .flatMap((day) =>
      day.commitments
        .filter((commitment) => commitment.commitment_id && recurringIncomeIds.has(commitment.commitment_id))
        .map(() => day.date)
    )
    .sort((a, b) => a.localeCompare(b))[0] ?? null;

  const plannedThroughPayday = nextPayday
    ? projection
        .filter((day) => day.date < nextPayday)
        .flatMap((day) => day.commitments)
        .filter((commitment) => commitment.type === "bill" && (commitment.original_due_date ?? commitment.due_date ?? "") >= today)
        .reduce((sum, commitment) => sum + commitment.amount, 0)
    : 0;

  return {
    onHand,
    nextPayday,
    plannedThroughPayday,
    safeToSpend: onHand - plannedThroughPayday,
  };
}

export default function CashPositionStrip({ accounts, commitments, projection, lastUpdated }: Props) {
  const { onHand, nextPayday, plannedThroughPayday, safeToSpend } = getSafeToSpend(accounts, commitments, projection);

  const reserved = accounts
    .filter((a) => a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);

  const monthlySafetyAmount = getMonthlySafetyAmount(projection);
  const needsExtra = monthlySafetyAmount !== null && monthlySafetyAmount < 0;
  const safetyAmount = Math.abs(monthlySafetyAmount ?? 0);

  const fmt = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${safeToSpend < 0 ? "from-rose-500 to-rose-700" : "from-emerald-500 to-emerald-700"} p-5 text-white shadow-lg`}>
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className={`text-sm font-medium ${safeToSpend < 0 ? "text-rose-100" : "text-emerald-100"} tracking-wide uppercase`}>Safe To Spend</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmt(safeToSpend)}</p>
        <p className={`mt-2 text-xs ${safeToSpend < 0 ? "text-rose-100" : "text-emerald-100"}`}>
          {nextPayday
            ? `${fmt(onHand)} balance - ${fmt(plannedThroughPayday)} planned before ${format(parseISO(nextPayday), "MMM d")}`
            : `${fmt(onHand)} balance; add recurring income to set payday`}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 p-5 text-white shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-amber-100 tracking-wide uppercase">Reserved</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmt(reserved)}</p>
        <p className="mt-2 text-xs text-amber-200">Emergency &amp; savings</p>
      </div>

      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 p-5 text-white shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-sky-100 tracking-wide uppercase">
          {needsExtra ? "Stay Positive / Month" : "Safe Extra Spend / Month"}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight">
          {monthlySafetyAmount === null ? "—" : fmt(safetyAmount)}
        </p>
        <p className="mt-2 text-xs text-sky-200">
          {monthlySafetyAmount === null
            ? `Updated ${lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "—"}`
            : needsExtra
              ? "Monthly cash needed to avoid a 6-month dip below $0"
              : "Monthly room before a 6-month dip below $0"}
        </p>
      </div>
    </div>
  );
}
