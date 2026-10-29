"use client";

import { CommitmentWithInstances } from "@/lib/types";
import { format, parseISO, differenceInDays } from "date-fns";

interface Props {
  commitments: CommitmentWithInstances[];
}

export default function NextBills({ commitments }: Props) {
  const today = new Date();
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const cutoff = sevenDaysOut.toISOString().slice(0, 10);

  const getRemaining = (c: CommitmentWithInstances) => {
    const inst = c.instances?.find((i) => i.due_date === c.due_date);
    const planned = inst?.planned_amount ?? c.amount;
    const allocated = inst?.allocated_amount ?? 0;
    return planned - allocated;
  };

  const isFunded = (c: CommitmentWithInstances) => {
    const inst = c.instances?.find((i) => i.due_date === c.due_date);
    if (inst?.status === "funded" || inst?.status === "paid" || inst?.status === "skipped") return true;
    return getRemaining(c) <= 0.005;
  };

  const bills = commitments
    .filter((c) => c.active && !c.paid && c.type === "bill" && c.due_date <= cutoff && !isFunded(c))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const income = commitments
    .filter((c) => c.active && !c.paid && c.type === "income" && c.due_date <= cutoff && !isFunded(c))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const totalBillsDue = bills.reduce((sum, c) => sum + getRemaining(c), 0);
  const totalIncome = income.reduce((sum, c) => sum + getRemaining(c), 0);

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">Next 7 Days</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[var(--negative)] font-semibold">
            −${totalBillsDue.toLocaleString("en-US", { minimumFractionDigits: 2 })} out
          </span>
          <span className="text-[var(--positive)] font-semibold">
            +${totalIncome.toLocaleString("en-US", { minimumFractionDigits: 2 })} in
          </span>
        </div>
      </div>

      <div className="space-y-2 max-h-[460px] overflow-y-auto">
        {[...bills, ...income]
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
          .map((item) => {
            const daysUntil = differenceInDays(parseISO(item.due_date), today);
            const remaining = getRemaining(item);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--surface-3)] transition-colors"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-white text-xs font-bold ${
                    item.type === "income"
                      ? "bg-[var(--positive)]"
                      : "bg-[var(--negative)]"
                  }`}
                >
                  {daysUntil <= 0 ? "!" : `${daysUntil}d`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{item.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {format(parseISO(item.due_date), "EEE, MMM d")}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    item.type === "income" ? "text-[var(--positive)]" : "text-[var(--text)]"
                  }`}
                >
                  {item.type === "income" ? "+" : "−"}$
                  {remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}

        {bills.length === 0 && income.length === 0 && (
          <p className="text-center text-sm text-[var(--muted)] py-4">
            No expenses in the next 7 days
          </p>
        )}
      </div>
    </div>
  );
}
