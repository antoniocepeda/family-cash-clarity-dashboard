"use client";

import { useState, useRef, useEffect } from "react";
import RowMenu from "@/components/ui/RowMenu";
import StatusDot from "@/components/ui/StatusDot";
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
  onEditInstanceAmount?: (commitmentId: string, dueDate: string, newAmount: number) => void;
  onReceiveIncome?: (commitmentId: string, dueDate: string, actualAmount: number) => void;
  simulatedIds: Set<string>;
  onSimulateToggle: (id: string) => void;
}

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
    commitment.instances?.find((i) => (i.original_due_date || i.due_date) === dateStr) || null;

  if (!rule) {
    const inst = findInstance(commitment.due_date);
    rows.push({ commitment, occurrenceDate: inst ? parseISO(inst.due_date) : baseDate, isFirstOccurrence: true, instance: inst });
    return rows;
  }

  let cursor = baseDate;

  if (isBefore(baseDate, windowStart)) {
    const dateStr = format(baseDate, "yyyy-MM-dd");
    const inst = findInstance(dateStr);
    if (!inst || !["paid", "funded", "skipped"].includes(inst.status)) {
      rows.push({
        commitment,
        occurrenceDate: inst ? parseISO(inst.due_date) : baseDate,
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
      occurrenceDate: inst ? parseISO(inst.due_date) : cursor,
      isFirstOccurrence: isFirst && isEqual(cursor, baseDate),
      instance: inst,
    });
    isFirst = false;
    cursor = advanceByRule(cursor, rule);
  }

  return rows;
}

export default function UpcomingCommitments({ commitments, onEditInstanceAmount, onReceiveIncome, simulatedIds, onSimulateToggle }: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [receivingKey, setReceivingKey] = useState<string | null>(null);
  const [receiveValue, setReceiveValue] = useState("");
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
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        No expenses. Add income or bills to get started.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <p className="eyebrow">Commitments</p>
        <h2 className="mt-1 text-3xl font-medium text-[var(--text)]">Upcoming</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="data-list w-full text-sm">
          <thead>
            <tr className="border-y border-[var(--line)] bg-[var(--surface-2)]">
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Event</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Amount</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Due</th>
              <th className="px-5 py-2.5 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Recurrence</th>
              <th className="px-5 py-2.5 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {allRows.map((row) => {
              const { commitment, occurrenceDate, instance } = row;
              const daysUntil = differenceInDays(occurrenceDate, today);
              const paidOutside = commitment.paid_outside === true;
              const isDueSoon = daysUntil <= 2 && daysUntil >= 0 && !paidOutside;

              const planned = instance?.planned_amount ?? commitment.amount;
              const allocated = instance?.allocated_amount ?? 0;
              const remaining = planned - allocated;
              const isFunded = instance?.status === "paid" || instance?.status === "funded" || instance?.status === "skipped" || remaining <= 0.005;
              const isOverdue = daysUntil < 0 && !isFunded && !paidOutside;
              const progressPct = planned > 0 ? Math.min(100, (allocated / planned) * 100) : 0;

              return (
                <tr
                  key={`${commitment.id}-${format(occurrenceDate, "yyyy-MM-dd")}`}
                  className={`hover:bg-[var(--surface-3)] transition-colors ${isFunded ? "opacity-60" : ""}`}
                >
                  <td className="px-5 py-3" data-label="">
                    <div className="flex items-center gap-3">
                      <span className="activity-mark" aria-hidden="true">{commitment.name.trim().charAt(0).toUpperCase()}</span>
                      <span className="min-w-0">
                      <span className="block font-medium text-[var(--text)]">{commitment.name}</span>
                      {isFunded && <StatusDot tone="positive" label="Paid" />}
                      {isOverdue && !isFunded && <StatusDot tone="negative" label="Overdue" />}
                      {isDueSoon && !isOverdue && <StatusDot tone="warning" label="Due soon" />}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3" data-label="Amount">
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
                            <span className="text-[var(--muted)] text-sm">$</span>
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
                              className="w-24 rounded border border-[var(--line-strong)] px-2 py-1 text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)] outline-none"
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
                              className={`font-medium tabular-nums ${
                                commitment.type === "income" ? "text-[var(--positive)]" : isOverdue ? "is-overdue-text" : "text-[var(--text)]"
                              }`}
                            >
                              {commitment.type === "income" ? "+" : "−"}$
                              {remaining.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                            {allocated > 0.005 && (
                              <span className="text-[10px] text-[var(--muted)]">
                                / ${planned.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            {onEditInstanceAmount && !isFunded && (
                              <svg className="h-3 w-3 text-[var(--faint)] opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            )}
                          </div>
                          {allocated > 0.005 && (
                            <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--surface-2)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-[var(--text)] transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-5 py-3" data-label="Due">
                    <div className="flex items-center gap-1.5">
                      <span className={isOverdue ? "is-overdue-text font-medium" : "text-[var(--text-secondary)]"}>
                        {format(occurrenceDate, "MMM d")}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-[var(--muted)] capitalize" data-label="Repeats">
                    {commitment.recurrence_rule?.startsWith("every_") && commitment.recurrence_rule?.endsWith("_days")
                      ? `Every ${commitment.recurrence_rule.slice(6, -5)} days`
                      : commitment.recurrence_rule?.startsWith("every_") && commitment.recurrence_rule?.endsWith("_weeks")
                      ? `Every ${commitment.recurrence_rule.slice(6, -6)} weeks`
                      : commitment.recurrence_rule || "One-time"}
                  </td>
                  <td className="px-5 py-3 text-right" data-label="Action">
                    {receivingKey === `${commitment.id}-${format(occurrenceDate, "yyyy-MM-dd")}` ? (
                      <form
                        className="flex items-center justify-end gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const actualAmount = parseFloat(receiveValue);
                          if (Number.isFinite(actualAmount) && actualAmount > 0) {
                            onReceiveIncome?.(commitment.id, format(occurrenceDate, "yyyy-MM-dd"), actualAmount);
                            setReceivingKey(null);
                          }
                        }}
                      >
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          step="0.01"
                          value={receiveValue}
                          onChange={(event) => setReceiveValue(event.target.value)}
                          className="w-28"
                          aria-label={`Actual amount received for ${commitment.name}`}
                        />
                        <button className="btn btn-primary">Save</button>
                        <button type="button" onClick={() => setReceivingKey(null)} className="btn btn-secondary">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <div className="flex justify-end">
                        <RowMenu
                          label={`Actions for ${commitment.name}`}
                          items={[
                            ...(!commitment.recurrence_rule && isAfter(parseISO(commitment.due_date), projectionCutoff)
                              ? [{
                                  label: simulatedIds.has(commitment.id) ? "Stop what if" : "What if",
                                  onSelect: () => onSimulateToggle(commitment.id),
                                }]
                              : []),
                            ...(!isFunded && commitment.type === "bill" && onEditInstanceAmount
                              ? [{
                                  label: "Adjust",
                                  onSelect: () => {
                                    setEditingKey(`${commitment.id}-${format(occurrenceDate, "yyyy-MM-dd")}`);
                                    setEditValue(planned.toFixed(2));
                                  },
                                }]
                              : []),
                            ...(!isFunded && commitment.type === "income" && onReceiveIncome
                              ? [{
                                  label: "Receive",
                                  onSelect: () => {
                                    setReceivingKey(`${commitment.id}-${format(occurrenceDate, "yyyy-MM-dd")}`);
                                    setReceiveValue(planned.toFixed(2));
                                  },
                                }]
                              : []),
                          ]}
                        />
                      </div>
                    )}
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
