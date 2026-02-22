"use client";

import { useState } from "react";
import { CashEvent } from "@/lib/types";
import {
  format, parseISO, differenceInDays, addDays, addWeeks, addMonths,
  isAfter, isBefore, isEqual, startOfDay,
} from "date-fns";

interface Props {
  events: CashEvent[];
  onMarkPaid: (id: string, actualAmount: number) => void;
  simulatedIds: Set<string>;
  onSimulateToggle: (id: string) => void;
}

const priorityBadge = {
  critical: "bg-red-100 text-red-700",
  normal: "bg-slate-100 text-slate-600",
  flexible: "bg-blue-100 text-blue-600",
};

interface OccurrenceRow {
  event: CashEvent;
  occurrenceDate: Date;
  isFirstOccurrence: boolean;
}

function expandEventOccurrences(event: CashEvent, windowStart: Date, windowEnd: Date): OccurrenceRow[] {
  const rows: OccurrenceRow[] = [];
  const baseDate = startOfDay(parseISO(event.due_date));
  const rule = event.recurrence_rule;

  if (!rule) {
    rows.push({ event, occurrenceDate: baseDate, isFirstOccurrence: true });
    return rows;
  }

  const advanceFn =
    rule === "weekly" ? (d: Date) => addDays(d, 7)
    : rule === "biweekly" ? (d: Date) => addWeeks(d, 2)
    : rule === "monthly" ? (d: Date) => addMonths(d, 1)
    : rule === "quarterly" ? (d: Date) => addMonths(d, 3)
    : rule === "annual" ? (d: Date) => addMonths(d, 12)
    : null;

  if (!advanceFn) {
    rows.push({ event, occurrenceDate: baseDate, isFirstOccurrence: true });
    return rows;
  }

  let cursor = baseDate;
  while (isBefore(cursor, windowStart)) {
    cursor = advanceFn(cursor);
  }

  let isFirst = true;
  while (isBefore(cursor, windowEnd) || isEqual(cursor, windowEnd)) {
    rows.push({
      event,
      occurrenceDate: cursor,
      isFirstOccurrence: isFirst && isEqual(cursor, baseDate),
    });
    isFirst = false;
    cursor = advanceFn(cursor);
  }

  return rows;
}

export default function UpcomingEvents({ events, onMarkPaid, simulatedIds, onSimulateToggle }: Props) {
  const [confirmingEvent, setConfirmingEvent] = useState<CashEvent | null>(null);
  const today = startOfDay(new Date());
  const projectionCutoff = addDays(today, 28);

  const active = events.filter((e) => e.active && !e.paid);

  const allRows: OccurrenceRow[] = [];
  for (const event of active) {
    allRows.push(...expandEventOccurrences(event, today, projectionCutoff));
  }
  allRows.sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());

  if (allRows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
        No upcoming events. Add income or bills to get started.
      </div>
    );
  }

  return (
    <>
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
              {allRows.map((row, idx) => {
                const { event, occurrenceDate, isFirstOccurrence } = row;
                const daysUntil = differenceInDays(occurrenceDate, today);
                const isOverdue = daysUntil < 0;
                const isDueSoon = daysUntil <= 2 && daysUntil >= 0;
                const isFutureOccurrence = !isFirstOccurrence;

                return (
                  <tr
                    key={`${event.id}-${format(occurrenceDate, "yyyy-MM-dd")}`}
                    className={`hover:bg-slate-50/50 transition-colors ${isFutureOccurrence ? "opacity-60" : ""}`}
                  >
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
                          {format(occurrenceDate, "MMM d")}
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
                      <div className="flex items-center justify-end gap-2">
                        {!event.recurrence_rule && isAfter(parseISO(event.due_date), projectionCutoff) && (
                          <button
                            onClick={() => onSimulateToggle(event.id)}
                            className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                              simulatedIds.has(event.id)
                                ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                            }`}
                            title="Simulate paying this early in the 28-day projection"
                          >
                            {simulatedIds.has(event.id) ? "Simulating" : "What if?"}
                          </button>
                        )}
                        {isFirstOccurrence ? (
                          <button
                            onClick={() => setConfirmingEvent(event)}
                            className="text-xs font-medium text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Confirm
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">upcoming</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirmingEvent && (
        <ConfirmPaymentModal
          event={confirmingEvent}
          onClose={() => setConfirmingEvent(null)}
          onConfirm={(actualAmount) => {
            onMarkPaid(confirmingEvent.id, actualAmount);
            setConfirmingEvent(null);
          }}
        />
      )}
    </>
  );
}

function ConfirmPaymentModal({
  event,
  onClose,
  onConfirm,
}: {
  event: CashEvent;
  onClose: () => void;
  onConfirm: (actualAmount: number) => void;
}) {
  const [actualAmount, setActualAmount] = useState(event.amount.toString());

  const parsedAmount = parseFloat(actualAmount);
  const isValid = !isNaN(parsedAmount) && parsedAmount >= 0;
  const diff = isValid ? parsedAmount - event.amount : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">
          Confirm {event.type === "income" ? "Income" : "Payment"}
        </h3>
        <p className="text-sm text-slate-500 mb-5">{event.name}</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Estimated amount</span>
            <span className="font-medium text-slate-700">
              ${event.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Actual amount ($)
            </label>
            <input
              type="number"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              min="0"
              step="0.01"
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>

          {isValid && diff !== 0 && (
            <p className={`text-xs font-medium ${diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {diff > 0 ? "+" : ""}${diff.toFixed(2)} vs estimate
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => isValid && onConfirm(parsedAmount)}
            disabled={!isValid}
            className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm {event.type === "income" ? "Received" : "Paid"}
          </button>
        </div>
      </div>
    </div>
  );
}
