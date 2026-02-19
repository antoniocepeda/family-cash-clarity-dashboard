"use client";

import { CashEvent } from "@/lib/types";
import { format, parseISO, differenceInDays } from "date-fns";

interface Props {
  events: CashEvent[];
  onMarkPaid: (id: string) => void;
}

const priorityBadge = {
  critical: "bg-red-100 text-red-700",
  normal: "bg-slate-100 text-slate-600",
  flexible: "bg-blue-100 text-blue-600",
};

export default function UpcomingEvents({ events, onMarkPaid }: Props) {
  const today = new Date();
  const active = events
    .filter((e) => e.active && !e.paid)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, 15);

  if (active.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
        No upcoming events. Add income or bills to get started.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-semibold text-slate-800">Upcoming Events</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/50">
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Event</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recurrence</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {active.map((event) => {
              const daysUntil = differenceInDays(parseISO(event.due_date), today);
              const isOverdue = daysUntil < 0;
              const isDueSoon = daysUntil <= 2 && daysUntil >= 0;

              return (
                <tr key={event.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          event.type === "income" ? "bg-emerald-500" : "bg-rose-400"
                        }`}
                      />
                      <span className="font-medium text-slate-800">{event.name}</span>
                      {event.autopay === 1 && (
                        <span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                          AUTO
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`font-semibold ${
                        event.type === "income" ? "text-emerald-600" : "text-slate-800"
                      }`}
                    >
                      {event.type === "income" ? "+" : "−"}$
                      {event.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`${isOverdue ? "text-red-600 font-semibold" : isDueSoon ? "text-amber-600 font-medium" : "text-slate-600"}`}>
                        {format(parseISO(event.due_date), "MMM d")}
                      </span>
                      {isOverdue && (
                        <span className="text-[10px] font-bold text-red-600">OVERDUE</span>
                      )}
                      {isDueSoon && !isOverdue && (
                        <span className="text-[10px] font-semibold text-amber-600">SOON</span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-500 capitalize">
                    {event.recurrence_rule || "One-time"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        priorityBadge[event.priority]
                      }`}
                    >
                      {event.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => onMarkPaid(event.id)}
                      className="text-xs font-medium text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Mark Paid
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
