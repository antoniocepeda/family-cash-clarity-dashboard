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
    if (inst?.status === "funded") return true;
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Next 7 Days</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-rose-600 font-semibold">
            −${totalBillsDue.toLocaleString("en-US", { minimumFractionDigits: 2 })} out
          </span>
          <span className="text-emerald-600 font-semibold">
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
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-white text-xs font-bold ${
                    item.type === "income"
                      ? "bg-emerald-500"
                      : item.priority === "critical"
                      ? "bg-red-500"
                      : "bg-slate-400"
                  }`}
                >
                  {daysUntil <= 0 ? "!" : `${daysUntil}d`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-400">
                    {format(parseISO(item.due_date), "EEE, MMM d")}
                    {item.autopay ? " · Autopay" : ""}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    item.type === "income" ? "text-emerald-600" : "text-slate-800"
                  }`}
                >
                  {item.type === "income" ? "+" : "−"}$
                  {remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}

        {bills.length === 0 && income.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-4">
            No expenses in the next 7 days
          </p>
        )}
      </div>
    </div>
  );
}
