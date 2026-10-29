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

function HeroAmount({ value }: { value: number }) {
  const negative = value < 0;
  const abs = Math.abs(value);
  const dollars = Math.trunc(abs).toLocaleString("en-US");
  const cents = abs.toFixed(2).slice(-2);

  return (
    <p className={`money-xl ${negative ? "text-[var(--negative)]" : "text-[var(--text)]"}`}>
      <span className="mr-1 align-top text-[0.38em] text-[var(--muted)]">{negative ? "−$" : "$"}</span>
      {dollars}
      <span className="text-[0.38em] text-[var(--muted)]">.{cents}</span>
    </p>
  );
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
    <section className="space-y-3">
      <div className="surface px-5 py-6 sm:px-7 sm:py-8">
        <p className="eyebrow">Safe to spend</p>
        <HeroAmount value={safeToSpend} />
        <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted)]">
          {nextPayday
            ? `${fmt(onHand)} balance − ${fmt(plannedThroughPayday)} planned before ${format(parseISO(nextPayday), "MMM d")}`
            : `${fmt(onHand)} balance. Add recurring income to set payday.`}
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-[var(--faint)]">
          Updated {lastUpdated ? new Date(lastUpdated).toLocaleDateString() : "—"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="surface px-4 py-4">
          <p className="eyebrow">Reserved</p>
          <p className="money mt-2 text-2xl text-[var(--text)]">{fmt(reserved)}</p>
          <p className="mt-2 text-xs text-[var(--muted)]">Emergency and savings</p>
        </div>
        <div className="surface px-4 py-4">
          <p className="eyebrow">{needsExtra ? "Needed / month" : "Room / month"}</p>
          <p className={`money mt-2 text-2xl ${needsExtra ? "text-[var(--negative)]" : "text-[var(--text)]"}`}>
            {monthlySafetyAmount === null ? "—" : fmt(safetyAmount)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            {monthlySafetyAmount === null
              ? "Waiting on a projection"
              : needsExtra
                ? "To avoid a 6-month dip below zero"
                : "Before a 6-month dip below zero"}
          </p>
        </div>
      </div>
    </section>
  );
}
