"use client";

import { useState } from "react";
import { CashEventWithInstances, EventInstance } from "@/lib/types";
import {
  format, parseISO, differenceInDays, addDays, addWeeks, addMonths,
  isAfter, isBefore, isEqual, startOfDay,
} from "date-fns";

interface Props {
  events: CashEventWithInstances[];
  onMarkPaid: (id: string, actualAmount: number, instanceDueDate: string) => void;
  onRollover: (id: string, instanceDueDate: string) => void;
  simulatedIds: Set<string>;
  onSimulateToggle: (id: string) => void;
}

const priorityBadge = {
  critical: "bg-red-100 text-red-700",
  normal: "bg-slate-100 text-slate-600",
  flexible: "bg-blue-100 text-blue-600",
};

interface OccurrenceRow {
  event: CashEventWithInstances;
  occurrenceDate: Date;
  isFirstOccurrence: boolean;
  instance: EventInstance | null;
}

function expandEventOccurrences(
  event: CashEventWithInstances,
  windowStart: Date,
  windowEnd: Date
): OccurrenceRow[] {
  const rows: OccurrenceRow[] = [];
  const baseDate = startOfDay(parseISO(event.due_date));
  const rule = event.recurrence_rule;

  const findInstance = (dateStr: string) =>
    event.instances?.find((i) => i.due_date === dateStr) || null;

  if (!rule) {
    const inst = findInstance(event.due_date);
    rows.push({ event, occurrenceDate: baseDate, isFirstOccurrence: true, instance: inst });
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
    const inst = findInstance(event.due_date);
    rows.push({ event, occurrenceDate: baseDate, isFirstOccurrence: true, instance: inst });
    return rows;
  }

  let cursor = baseDate;

  if (isBefore(baseDate, windowStart)) {
    const dateStr = format(baseDate, "yyyy-MM-dd");
    const inst = findInstance(dateStr);
    if (!inst || inst.status !== "funded") {
      rows.push({
        event,
        occurrenceDate: baseDate,
        isFirstOccurrence: true,
        instance: inst,
      });
    }
    cursor = advanceFn(cursor);
    while (isBefore(cursor, windowStart)) {
      cursor = advanceFn(cursor);
    }
  }

  let isFirst = rows.length === 0;
  while (isBefore(cursor, windowEnd) || isEqual(cursor, windowEnd)) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const inst = findInstance(dateStr);
    rows.push({
      event,
      occurrenceDate: cursor,
      isFirstOccurrence: isFirst && isEqual(cursor, baseDate),
      instance: inst,
    });
    isFirst = false;
    cursor = advanceFn(cursor);
  }

  return rows;
}

export default function UpcomingEvents({ events, onMarkPaid, onRollover, simulatedIds, onSimulateToggle }: Props) {
  const [confirmingRow, setConfirmingRow] = useState<OccurrenceRow | null>(null);
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
              {allRows.map((row) => {
                const { event, occurrenceDate, instance } = row;
                const daysUntil = differenceInDays(occurrenceDate, today);
                const isOverdue = daysUntil < 0;
                const isDueSoon = daysUntil <= 2 && daysUntil >= 0;

                const planned = instance?.planned_amount ?? event.amount;
                const allocated = instance?.allocated_amount ?? 0;
                const remaining = planned - allocated;
                const isFunded = instance?.status === "funded" || remaining <= 0.005;
                const progressPct = planned > 0 ? Math.min(100, (allocated / planned) * 100) : 0;

                return (
                  <tr
                    key={`${event.id}-${format(occurrenceDate, "yyyy-MM-dd")}`}
                    className={`hover:bg-slate-50/50 transition-colors ${isFunded ? "opacity-60" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full shrink-0 ${
                            event.type === "income" ? "bg-emerald-500" : isFunded ? "bg-emerald-400" : "bg-rose-400"
                          }`}
                        />
                        <span className="font-medium text-slate-800">{event.name}</span>
                        {event.autopay === 1 && (
                          <span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                            AUTO
                          </span>
                        )}
                        {isFunded && (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                            FUNDED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span
                            className={`font-semibold ${
                              event.type === "income" ? "text-emerald-600" : "text-slate-800"
                            }`}
                          >
                            {event.type === "income" ? "+" : "−"}$
                            {remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                          {allocated > 0.005 && (
                            <span className="text-[10px] text-slate-400">
                              / ${planned.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                        {allocated > 0.005 && (
                          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isFunded ? "bg-emerald-400" : "bg-amber-400"
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        )}
                      </div>
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
                        {isFunded ? (
                          <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                            <svg className="h-3.5 w-3.5 inline -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            Done
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                const dueDate = format(occurrenceDate, "yyyy-MM-dd");
                                onRollover(event.id, dueDate);
                              }}
                              className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                              title="Skip remaining and move to next cycle"
                            >
                              Rollover
                            </button>
                            <button
                              onClick={() => setConfirmingRow(row)}
                              className="text-xs font-medium text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Fund{remaining < planned - 0.005 ? ` $${remaining.toFixed(2)}` : ""}
                            </button>
                          </>
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

      {confirmingRow && (
        <ConfirmPaymentModal
          row={confirmingRow}
          onClose={() => setConfirmingRow(null)}
          onConfirm={(actualAmount) => {
            const dueDate = format(confirmingRow.occurrenceDate, "yyyy-MM-dd");
            onMarkPaid(confirmingRow.event.id, actualAmount, dueDate);
            setConfirmingRow(null);
          }}
        />
      )}
    </>
  );
}

function ConfirmPaymentModal({
  row,
  onClose,
  onConfirm,
}: {
  row: OccurrenceRow;
  onClose: () => void;
  onConfirm: (actualAmount: number) => void;
}) {
  const { event, instance } = row;
  const planned = instance?.planned_amount ?? event.amount;
  const allocated = instance?.allocated_amount ?? 0;
  const remaining = planned - allocated;

  const [actualAmount, setActualAmount] = useState(remaining.toFixed(2));

  const parsedAmount = parseFloat(actualAmount);
  const isValid = !isNaN(parsedAmount) && parsedAmount >= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">
          Fund {event.type === "income" ? "Income" : "Remaining"}
        </h3>
        <p className="text-sm text-slate-500 mb-5">{event.name}</p>

        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Planned</span>
              <span className="font-medium text-slate-700">
                ${planned.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {allocated > 0.005 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Already allocated</span>
                <span className="font-medium text-emerald-600">
                  ${allocated.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs border-t border-slate-200 pt-1.5">
              <span className="font-semibold text-slate-700">Remaining</span>
              <span className="font-semibold text-slate-700">
                ${remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Amount to fund ($)
            </label>
            <input
              type="number"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              min="0"
              max={remaining.toFixed(2)}
              step="0.01"
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>

          {isValid && parsedAmount > remaining + 0.005 && (
            <p className="text-xs font-medium text-red-600">
              Exceeds remaining by ${(parsedAmount - remaining).toFixed(2)}
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
            disabled={!isValid || parsedAmount > remaining + 0.005}
            className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {event.type === "income" ? "Confirm Received" : "Fund It"}
          </button>
        </div>
      </div>
    </div>
  );
}
