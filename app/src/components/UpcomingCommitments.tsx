"use client";

import { useState, useRef, useEffect } from "react";
import { CommitmentWithInstances, CommitmentInstance } from "@/lib/types";
import {
  format, parseISO, differenceInDays, addDays, addWeeks, addMonths,
  isAfter, isBefore, isEqual, startOfDay,
} from "date-fns";

function advanceByRule(base: Date, rule: string): Date {
  if (rule.startsWith("every_")) {
    if (rule.endsWith("_days")) {
      const n = parseInt(rule.slice(6, -5), 10);
      if (!isNaN(n) && n > 0) return addDays(base, n);
    }
    if (rule.endsWith("_weeks")) {
      const n = parseInt(rule.slice(6, -6), 10);
      if (!isNaN(n) && n > 0) return addWeeks(base, n);
    }
  }
  switch (rule) {
    case "weekly": return addDays(base, 7);
    case "biweekly": return addWeeks(base, 2);
    case "monthly": return addMonths(base, 1);
    case "quarterly": return addMonths(base, 3);
    case "annual": return addMonths(base, 12);
    default: return addMonths(base, 1);
  }
}

interface Props {
  commitments: CommitmentWithInstances[];
  onRollover: (id: string, instanceDueDate: string) => void;
  onEditInstanceAmount?: (commitmentId: string, dueDate: string, newAmount: number) => void;
  onLeftover?: (commitmentId: string, instanceDueDate: string, action: "rollover" | "release") => void;
  simulatedIds: Set<string>;
  onSimulateToggle: (id: string) => void;
}

const priorityBadge = {
  critical: "bg-red-100 text-red-700",
  normal: "bg-slate-100 text-slate-600",
  flexible: "bg-blue-100 text-blue-600",
};

interface OccurrenceRow {
  commitment: CommitmentWithInstances;
  occurrenceDate: Date;
  isFirstOccurrence: boolean;
  instance: CommitmentInstance | null;
}

function expandCommitmentOccurrences(
  commitment: CommitmentWithInstances,
  windowStart: Date,
  windowEnd: Date
): OccurrenceRow[] {
  const rows: OccurrenceRow[] = [];
  const baseDate = startOfDay(parseISO(commitment.due_date));
  const rule = commitment.recurrence_rule;

  const findInstance = (dateStr: string) =>
    commitment.instances?.find((i) => i.due_date === dateStr) || null;

  if (!rule) {
    const inst = findInstance(commitment.due_date);
    rows.push({ commitment, occurrenceDate: baseDate, isFirstOccurrence: true, instance: inst });
    return rows;
  }

  let cursor = baseDate;

  if (isBefore(baseDate, windowStart)) {
    const dateStr = format(baseDate, "yyyy-MM-dd");
    const inst = findInstance(dateStr);
    if (!inst || inst.status !== "funded") {
      rows.push({
        commitment,
        occurrenceDate: baseDate,
        isFirstOccurrence: true,
        instance: inst,
      });
    }
    cursor = advanceByRule(cursor, rule);
    while (isBefore(cursor, windowStart)) {
      cursor = advanceByRule(cursor, rule);
    }
  }

  let isFirst = rows.length === 0;
  while (isBefore(cursor, windowEnd) || isEqual(cursor, windowEnd)) {
    const dateStr = format(cursor, "yyyy-MM-dd");
    const inst = findInstance(dateStr);
    rows.push({
      commitment,
      occurrenceDate: cursor,
      isFirstOccurrence: isFirst && isEqual(cursor, baseDate),
      instance: inst,
    });
    isFirst = false;
    cursor = advanceByRule(cursor, rule);
  }

  return rows;
}

export default function UpcomingCommitments({ commitments, onRollover, onEditInstanceAmount, onLeftover, simulatedIds, onSimulateToggle }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const today = startOfDay(new Date());
  const projectionCutoff = addDays(today, 28);

  useEffect(() => {
    if (editingKey && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingKey]);

  const active = commitments.filter((c) => c.active && !c.paid);

  const allRows: OccurrenceRow[] = [];
  for (const commitment of active) {
    allRows.push(...expandCommitmentOccurrences(commitment, today, projectionCutoff));
  }
  allRows.sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());

  if (allRows.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
        No expenses. Add income or bills to get started.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-lg font-semibold text-slate-800">Expenses</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-slate-100 bg-slate-50/50">
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Expense</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recurrence</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allRows.map((row) => {
              const { commitment, occurrenceDate, instance } = row;
              const daysUntil = differenceInDays(occurrenceDate, today);
              const isOverdue = daysUntil < 0;
              const isDueSoon = daysUntil <= 2 && daysUntil >= 0;

              const planned = instance?.planned_amount ?? commitment.amount;
              const allocated = instance?.allocated_amount ?? 0;
              const remaining = planned - allocated;
              const isFunded = instance?.status === "funded" || remaining <= 0.005;
              const progressPct = planned > 0 ? Math.min(100, (allocated / planned) * 100) : 0;

              return (
                <tr
                  key={`${commitment.id}-${format(occurrenceDate, "yyyy-MM-dd")}`}
                  className={`hover:bg-slate-50/50 transition-colors ${isFunded ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          commitment.type === "income" ? "bg-emerald-500" : isFunded ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      <span className="font-medium text-slate-800">{commitment.name}</span>
                      {commitment.autopay === 1 && (
                        <span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">
                          AUTO
                        </span>
                      )}
                      {isFunded && (
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                          PAID
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    {(() => {
                      const rowKey = `${commitment.id}-${format(occurrenceDate, "yyyy-MM-dd")}`;
                      const isEditing = editingKey === rowKey;

                      const handleStartEdit = () => {
                        if (!onEditInstanceAmount || isFunded) return;
                        setEditingKey(rowKey);
                        setEditValue(planned.toFixed(2));
                      };

                      const handleSaveEdit = () => {
                        const newAmount = parseFloat(editValue);
                        if (!isNaN(newAmount) && newAmount >= 0 && onEditInstanceAmount) {
                          onEditInstanceAmount(commitment.id, format(occurrenceDate, "yyyy-MM-dd"), newAmount);
                        }
                        setEditingKey(null);
                      };

                      const handleCancelEdit = () => setEditingKey(null);

                      if (isEditing) {
                        return (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400 text-sm">$</span>
                            <input
                              ref={editInputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveEdit();
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                              onBlur={handleSaveEdit}
                              min="0"
                              step="0.01"
                              className="w-24 rounded border border-sky-300 px-2 py-1 text-sm font-semibold focus:ring-2 focus:ring-sky-500 outline-none"
                            />
                          </div>
                        );
                      }

                      return (
                        <div
                          className={`group ${onEditInstanceAmount && !isFunded ? "cursor-pointer" : ""}`}
                          onClick={handleStartEdit}
                          title={onEditInstanceAmount && !isFunded ? "Click to edit amount" : undefined}
                        >
                          <div className="flex items-baseline gap-1">
                            <span
                              className={`font-semibold ${
                                commitment.type === "income" ? "text-emerald-600" : "text-slate-800"
                              }`}
                            >
                              {commitment.type === "income" ? "+" : "−"}$
                              {remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                            {allocated > 0.005 && (
                              <span className="text-[10px] text-slate-400">
                                / ${planned.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            {onEditInstanceAmount && !isFunded && (
                              <svg className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
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
                      );
                    })()}
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
                    {commitment.recurrence_rule?.startsWith("every_") && commitment.recurrence_rule?.endsWith("_days")
                      ? `Every ${commitment.recurrence_rule.slice(6, -5)} days`
                      : commitment.recurrence_rule?.startsWith("every_") && commitment.recurrence_rule?.endsWith("_weeks")
                      ? `Every ${commitment.recurrence_rule.slice(6, -6)} weeks`
                      : commitment.recurrence_rule || "One-time"}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        priorityBadge[commitment.priority]
                      }`}
                    >
                      {commitment.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!commitment.recurrence_rule && isAfter(parseISO(commitment.due_date), projectionCutoff) && (
                        <button
                          onClick={() => onSimulateToggle(commitment.id)}
                          className={`text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                            simulatedIds.has(commitment.id)
                              ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
                              : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                          }`}
                          title="Simulate paying this early in the 28-day projection"
                        >
                          {simulatedIds.has(commitment.id) ? "Simulating" : "What if?"}
                        </button>
                      )}
                      {isFunded ? (
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg">
                          <svg className="h-3.5 w-3.5 inline -mt-0.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Done
                        </span>
                      ) : isOverdue && commitment.recurrence_rule && remaining > 0.005 && onLeftover ? (
                        <>
                          <button
                            onClick={() => {
                              const dueDate = format(occurrenceDate, "yyyy-MM-dd");
                              onLeftover(commitment.id, dueDate, "rollover");
                            }}
                            className="text-xs font-medium text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                            title="Carry leftover into next period's envelope"
                          >
                            Roll Over ${remaining.toFixed(2)}
                          </button>
                          <button
                            onClick={() => {
                              const dueDate = format(occurrenceDate, "yyyy-MM-dd");
                              onLeftover(commitment.id, dueDate, "release");
                            }}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                            title="Release unspent amount back to cash on hand"
                          >
                            Release ${remaining.toFixed(2)}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            const dueDate = format(occurrenceDate, "yyyy-MM-dd");
                            onRollover(commitment.id, dueDate);
                          }}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                          title="Skip remaining and move to next cycle"
                        >
                          Rollover
                        </button>
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
  );
}
