"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfToday,
  startOfWeek,
} from "date-fns";
import { CommitmentInstance, ProjectionDay } from "@/lib/types";

interface NewCashEvent {
  name: string;
  amount: number;
  due_date: string;
  recurrence_rule: string;
  type: "bill" | "income";
}

type EditableItem = ProjectionDay["commitments"][number];
type RiskState = "safe" | "tight" | "below buffer" | "negative" | "overdue";

interface Props {
  projection: ProjectionDay[];
  onAddEvent: (expense: NewCashEvent) => Promise<void>;
  onUpdateInstance: (input: {
    commitment_id: string;
    original_due_date: string;
    due_date: string;
    planned_amount: number;
    status: CommitmentInstance["status"];
    scope: "instance" | "future" | "template";
    name?: string;
  }) => Promise<void>;
  onDeleteInstance: (input: {
    commitment_id: string;
    original_due_date: string;
    due_date: string;
    planned_amount: number;
    name?: string;
  }) => Promise<void>;
}

const recurrenceOptions = [
  { value: "", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Yearly" },
];

const statuses: CommitmentInstance["status"][] = ["planned", "paid", "deferred", "skipped", "overdue"];

const money = (value: number, exact = false) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: exact ? 2 : 0,
    maximumFractionDigits: exact ? 2 : 0,
  });

function getRiskState(day: ProjectionDay | undefined, bufferAmount = 500): RiskState {
  if (!day) return "safe";
  const hasOverdue = day.commitments.some((item) => item.status === "overdue");
  const hasUnpaidBills = day.commitments.some((item) => item.type !== "income" && !["paid", "skipped"].includes(item.status ?? ""));
  if (hasOverdue || (isBefore(parseISO(day.date), startOfToday()) && hasUnpaidBills)) return "overdue";
  if (day.balance < 0) return "negative";
  if (day.balance < bufferAmount) return "below buffer";
  if (day.balance < bufferAmount * 1.5) return "tight";
  return "safe";
}

function dayClasses(risk: RiskState, inMonth: boolean, selected: boolean) {
  const base = selected ? "ring-2 ring-[var(--accent)]" : "";
  const dim = inMonth ? "" : "opacity-45";
  const colors = {
    safe: "border-[var(--line)] bg-[var(--surface)]",
    tight: "border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[var(--warning-soft)]",
    "below buffer": "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[var(--warning-soft)]",
    negative: "border-[color-mix(in_srgb,var(--negative)_45%,transparent)] bg-[var(--negative-soft)]",
    overdue: "border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[var(--warning-soft)]",
  };
  return `${base} ${dim} ${colors[risk]}`;
}

function riskLabelClasses(risk: RiskState) {
  switch (risk) {
    case "negative":
      return "bg-[var(--negative-soft)] text-[var(--negative)]";
    case "overdue":
      return "bg-[var(--warning-soft)] text-[var(--warning)]";
    case "below buffer":
      return "bg-[var(--warning-soft)] text-[var(--warning)]";
    case "tight":
      return "bg-[var(--warning-soft)] text-[var(--warning)]";
    default:
      return "bg-[var(--positive-soft)] text-[var(--positive)]";
  }
}

export default function CashCalendar({ projection, onAddEvent, onUpdateInstance, onDeleteInstance }: Props) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [type, setType] = useState<"bill" | "income">("bill");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [recurrence, setRecurrence] = useState("monthly");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<EditableItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<CommitmentInstance["status"]>("planned");
  const [editScope, setEditScope] = useState<"instance" | "future" | "template">("instance");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month]
  );

  const projectionByDate = useMemo(() => {
    const map = new Map<string, ProjectionDay>();
    projection.forEach((day) => map.set(day.date, day));
    return map;
  }, [projection]);

  const selectedKey = format(selectedDate, "yyyy-MM-dd");
  const selectedDay = projectionByDate.get(selectedKey);

  const openAddModal = (day: Date) => {
    setSelectedDate(day);
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    if (saving) return;
    setShowAddModal(false);
  };

  const saveEvent = async () => {
    const parsedAmount = parseFloat(amount);
    if (!name.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return;

    setSaving(true);
    try {
      await onAddEvent({
        name: name.trim(),
        amount: parsedAmount,
        due_date: format(selectedDate, "yyyy-MM-dd"),
        recurrence_rule: recurrence,
        type,
      });
      setName("");
      setAmount("");
      setRecurrence(type === "income" ? "" : "monthly");
      setShowAddModal(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: EditableItem) => {
    if (!item.commitment_id) return;
    setEditing(item);
    setEditName(item.name);
    setEditAmount(item.amount.toFixed(2));
    setEditDate(item.due_date ?? item.original_due_date ?? "");
    setEditStatus((item.status ?? "planned") as CommitmentInstance["status"]);
    setEditScope("instance");
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.commitment_id) return;
    const plannedAmount = parseFloat(editAmount);
    if (!Number.isFinite(plannedAmount) || plannedAmount < 0 || !editDate) return;
    setSaving(true);
    try {
      await onUpdateInstance({
        commitment_id: editing.commitment_id,
        original_due_date: editing.original_due_date ?? editing.due_date ?? editDate,
        due_date: editDate,
        planned_amount: plannedAmount,
        status: editStatus,
        scope: editScope,
        name: editName.trim() || editing.name,
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const moveItem = async (item: EditableItem, dueDate: string) => {
    if (!item.commitment_id) return;
    await onUpdateInstance({
      commitment_id: item.commitment_id,
      original_due_date: item.original_due_date ?? item.due_date ?? dueDate,
      due_date: dueDate,
      planned_amount: item.amount,
      status: (item.status ?? "planned") as CommitmentInstance["status"],
      scope: "instance",
      name: item.name,
    });
  };

  const deleteEditing = async () => {
    if (!editing?.commitment_id) return;
    setSaving(true);
    try {
      await onDeleteInstance({
        commitment_id: editing.commitment_id,
        original_due_date: editing.original_due_date ?? editing.due_date ?? editDate,
        due_date: editing.due_date ?? editDate,
        planned_amount: editing.amount,
        name: editing.name,
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-3 shadow-sm sm:p-4 xl:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Calendar</p>
          <h1 className="mt-1 text-3xl font-medium text-[var(--text)]">Cash</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Select a date to review it. Add an expense or deposit, or drag items on a larger screen to move due dates.</p>
        </div>
        <div className="scroll-row text-xs font-semibold lg:flex-wrap lg:justify-end lg:overflow-visible">
          {(["safe", "tight", "below buffer", "negative", "overdue"] as RiskState[]).map((risk) => (
            <span key={risk} className={`rounded-full px-2 py-1 capitalize ${riskLabelClasses(risk)}`}>{risk}</span>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        >
          <span aria-hidden="true">&lt;</span>
        </button>
        <h2 className="flex-1 text-center text-base font-medium tracking-tight text-[var(--text)]">{format(month, "MMMM yyyy")}</h2>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
        >
          <span aria-hidden="true">&gt;</span>
        </button>
      </div>
      <button
        type="button"
        onClick={() => setShowAddModal(true)}
        className="btn btn-primary mb-4 w-full sm:w-auto"
      >
        Add on {format(selectedDate, "MMM d")}
      </button>

      <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--faint)] lg:text-sm lg:tracking-[0.08em]">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day} className="py-2">
            <span className="sm:hidden">{day.slice(0, 1)}</span>
            <span className="hidden sm:inline">{day}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {calendarDays.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayProjection = projectionByDate.get(dateKey);
          const items = dayProjection?.commitments ?? [];
          const visibleItems = items.slice(0, 3);
          const risk = getRiskState(dayProjection);
          const selected = isSameDay(day, selectedDate);

          return (
            <button
              type="button"
              key={dateKey}
              onClick={() => {
                setSelectedDate(day);
                if (window.matchMedia("(min-width: 640px)").matches) openAddModal(day);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const payload = event.dataTransfer.getData("application/json");
                if (!payload) return;
                void moveItem(JSON.parse(payload) as EditableItem, dateKey).finally(() => setDraggingKey(null));
              }}
              aria-pressed={selected}
              className={`min-h-16 rounded-lg border p-1 text-left transition-colors hover:border-[var(--line-strong)] sm:min-h-40 sm:rounded-xl sm:p-2 lg:min-h-52 xl:min-h-60 ${dayClasses(risk, isSameMonth(day, month), selected)}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs font-medium text-[var(--text)] sm:text-base">{format(day, "d")}</span>
                {dayProjection && (
                  <>
                    <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full sm:hidden ${risk === "negative" ? "bg-[var(--negative)]" : risk === "safe" ? "bg-[var(--positive)]" : "bg-[var(--warning)]"}`} />
                    <span className={`hidden rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize sm:inline ${riskLabelClasses(risk)}`}>
                      {risk === "below buffer" ? "buffer" : risk}
                    </span>
                  </>
                )}
              </div>
              {dayProjection && (
                <div className={`mt-1 truncate text-[10px] font-medium tabular-nums sm:text-xs lg:text-sm ${dayProjection.balance < 0 ? "text-[var(--negative)]" : "text-[var(--muted)]"}`}>
                  <span className="hidden sm:inline">End </span>
                  {money(dayProjection.balance)}
                </div>
              )}
              {items.length > 0 && (
                <p className="mt-1 text-[10px] tabular-nums text-[var(--faint)] sm:hidden">{items.length}</p>
              )}
              <div className="mt-2 hidden space-y-1 sm:block">
                {visibleItems.map((item, index) => {
                  const itemKey = `${item.commitment_id}-${item.original_due_date}-${index}`;
                  const isIncome = item.type === "income";
                  return (
                    <span
                      key={itemKey}
                      role="button"
                      tabIndex={0}
                      draggable={Boolean(item.commitment_id)}
                      onClick={(event) => {
                        event.stopPropagation();
                        startEdit(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          startEdit(item);
                        }
                      }}
                      onDragStart={(event) => {
                        event.stopPropagation();
                        setDraggingKey(itemKey);
                        event.dataTransfer.setData("application/json", JSON.stringify(item));
                      }}
                      onDragEnd={() => setDraggingKey(null)}
                      className={`block cursor-grab rounded border px-1.5 py-1 text-[11px] font-semibold leading-tight shadow-sm active:cursor-grabbing lg:px-2 lg:py-1.5 lg:text-sm ${
                        isIncome
                          ? "border-[color-mix(in_srgb,var(--positive)_35%,transparent)] bg-[var(--surface)] text-[var(--positive)]"
                          : "border-[color-mix(in_srgb,var(--negative)_35%,transparent)] bg-[var(--surface)] text-[var(--negative)]"
                      } ${draggingKey === itemKey ? "opacity-50" : ""}`}
                    >
                      <span className="block truncate text-[var(--text)]">{item.name}</span>
                      <span className="tabular-nums">{isIncome ? "+" : "-"}{money(item.amount, item.amount % 1 !== 0)}</span>
                    </span>
                  );
                })}
                {items.length > visibleItems.length && (
                  <span className="block rounded bg-[var(--surface-2)] px-1.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                    +{items.length - visibleItems.length} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/75 p-0 sm:items-center sm:justify-center sm:p-4">
          <form
            className="w-full rounded-t-2xl bg-[var(--surface)] p-5 shadow-xl sm:max-w-xl sm:rounded-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEvent();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Add cash event</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{format(selectedDate, "EEEE, MMM d")}</p>
              </div>
              <button type="button" onClick={closeAddModal} className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-3)]">
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-md bg-[var(--surface-2)] p-1">
                <button type="button" onClick={() => setType("bill")} className={`rounded px-3 py-2 text-sm font-medium ${type === "bill" ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}>
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType("income");
                    setRecurrence("");
                  }}
                  className={`rounded px-3 py-2 text-sm font-medium ${type === "income" ? "bg-[var(--surface)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
                >
                  Deposit
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{type === "income" ? "Deposit source" : "Expense name"}</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-md border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Amount</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-md border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Repeats</span>
                  <select value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className="w-full rounded-md border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]">
                    {recurrenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <button disabled={!name.trim() || !amount || saving} className="mt-4 w-full rounded-md bg-[var(--text)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving..." : `Add ${recurrence ? "recurring " : ""}${type === "income" ? "deposit" : "expense"}`}
            </button>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-0 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={saveEdit} className="w-full rounded-t-2xl bg-[var(--surface)] p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-[var(--text)]">Edit calendar item</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Changes default to this occurrence only.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--surface-3)]">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Name</span>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Amount</span>
                <input type="number" min="0" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Due date</span>
                <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Status</span>
                <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as CommitmentInstance["status"])} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  {statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Apply to</span>
                <select value={editScope} onChange={(event) => setEditScope(event.target.value as "instance" | "future" | "template")} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="instance">This occurrence only</option>
                  <option value="future">This and future occurrences</option>
                  <option value="template">Recurring template</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={deleteEditing} disabled={saving} className="rounded-lg border border-[color-mix(in_srgb,var(--negative)_35%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--negative)] hover:bg-[var(--negative-soft)] disabled:opacity-50 sm:mr-auto">
                Delete occurrence
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-3)]">
                Cancel
              </button>
              <button disabled={saving} className="rounded-lg bg-[var(--text)] px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedDay && selectedDay.commitments.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">{format(selectedDate, "EEE, MMM d")} items</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedDay.commitments.map((item, index) => (
              <button
                key={`${item.commitment_id}-${item.original_due_date}-${index}`}
                type="button"
                onClick={() => startEdit(item)}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left hover:border-[var(--line-strong)] hover:bg-[var(--accent-soft)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--text)]">{item.name}</span>
                  <span className="text-xs capitalize text-[var(--muted)]">{item.status ?? "planned"}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${item.type === "income" ? "text-[var(--positive)]" : "text-[var(--negative)]"}`}>
                  {item.type === "income" ? "+" : "-"}{money(item.amount, true)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
