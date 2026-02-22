"use client";

import { CashEventWithInstances } from "@/lib/types";
import { format, parseISO, differenceInDays } from "date-fns";

interface Props {
  events: CashEventWithInstances[];
}

export default function NextBills({ events }: Props) {
  const today = new Date();
  const sevenDaysOut = new Date();
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const cutoff = sevenDaysOut.toISOString().slice(0, 10);

  const bills = events
    .filter((e) => e.active && !e.paid && e.type === "bill" && e.due_date <= cutoff)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const income = events
    .filter((e) => e.active && !e.paid && e.type === "income" && e.due_date <= cutoff)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const totalBillsDue = bills.reduce((sum, e) => sum + e.amount, 0);
  const totalIncome = income.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

      <div className="space-y-2">
        {[...bills, ...income]
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
          .map((event) => {
            const daysUntil = differenceInDays(parseISO(event.due_date), today);
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-white text-xs font-bold ${
                    event.type === "income"
                      ? "bg-emerald-500"
                      : event.priority === "critical"
                      ? "bg-red-500"
                      : "bg-slate-400"
                  }`}
                >
                  {daysUntil <= 0 ? "!" : `${daysUntil}d`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{event.name}</p>
                  <p className="text-xs text-slate-400">
                    {format(parseISO(event.due_date), "EEE, MMM d")}
                    {event.autopay ? " · Autopay" : ""}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    event.type === "income" ? "text-emerald-600" : "text-slate-800"
                  }`}
                >
                  {event.type === "income" ? "+" : "−"}$
                  {event.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}

        {bills.length === 0 && income.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-4">
            No events in the next 7 days
          </p>
        )}
      </div>
    </div>
  );
}
