"use client";

import { differenceInCalendarDays, parseISO } from "date-fns";
import { Account, ProjectionDay } from "@/lib/types";

interface Props {
  accounts: Account[];
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

export default function CashPositionStrip({ accounts, projection, lastUpdated }: Props) {
  const onHand = accounts
    .filter((a) => !a.is_reserve)
    .reduce((sum, a) => sum + a.current_balance, 0);

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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-5 text-white shadow-lg">
        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10" />
        <p className="text-sm font-medium text-emerald-100 tracking-wide uppercase">Cash On-Hand</p>
        <p className="mt-1 text-3xl font-bold tracking-tight">{fmt(onHand)}</p>
        <p className="mt-2 text-xs text-emerald-200">
          Across {accounts.filter((a) => !a.is_reserve).length} account{accounts.filter((a) => !a.is_reserve).length !== 1 ? "s" : ""}
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
