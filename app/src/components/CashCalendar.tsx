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
  const base = selected ? "ring-2 ring-sky-500" : "";
  const dim = inMonth ? "" : "opacity-45";
  const colors = {
    safe: "border-emerald-100 bg-emerald-50/45",
    tight: "border-yellow-200 bg-yellow-50",
    "below buffer": "border-amber-300 bg-amber-50",
    negative: "border-red-300 bg-red-50",
    overdue: "border-fuchsia-300 bg-fuchsia-50",
  };
  return `${base} ${dim} ${colors[risk]}`;
}

function riskLabelClasses(risk: RiskState) {
  switch (risk) {
    case "negative":
      return "bg-red-100 text-red-700";
    case "overdue":
      return "bg-fuchsia-100 text-fuchsia-700";
    case "below buffer":
      return "bg-amber-100 text-amber-800";
    case "tight":
      return "bg-yellow-100 text-yellow-800";
    default:
      return "bg-emerald-100 text-emerald-700";
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
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 xl:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cash Calendar</h1>
          <p className="mt-1 text-sm text-slate-500">Click any date to add an expense or deposit. Drag items to move due dates.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {(["safe", "tight", "below buffer", "negative", "overdue"] as RiskState[]).map((risk) => (
            <span key={risk} className={`rounded-full px-2 py-1 capitalize ${riskLabelClasses(risk)}`}>{risk}</span>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 sm:px-4">
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <span aria-hidden="true">&lt;</span>
        </button>
        <h2 className="text-lg font-semibold tracking-wide text-slate-900">{format(month, "MMMM yyyy")}</h2>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <span aria-hidden="true">&gt;</span>
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day} className="py-2">{day}</span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
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
                openAddModal(day);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const payload = event.dataTransfer.getData("application/json");
                if (!payload) return;
                void moveItem(JSON.parse(payload) as EditableItem, dateKey).finally(() => setDraggingKey(null));
              }}
              aria-pressed={selected}
              className={`min-h-[180px] rounded-xl border p-2 text-left transition-colors hover:border-sky-300 sm:min-h-[170px] lg:min-h-[160px] xl:min-h-[185px] ${dayClasses(risk, isSameMonth(day, month), selected)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-bold text-slate-900">{format(day, "d")}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold capitalize ${riskLabelClasses(risk)}`}>
                  {risk === "below buffer" ? "buffer" : risk}
                </span>
              </div>
              <div className={`mt-1 text-xs font-semibold ${dayProjection && dayProjection.balance < 0 ? "text-red-700" : "text-slate-600"}`}>
                End: {dayProjection ? money(dayProjection.balance) : "-"}
              </div>
              <div className="mt-2 space-y-1">
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
                      className={`block cursor-grab rounded border px-1.5 py-1 text-[11px] font-semibold leading-tight shadow-sm active:cursor-grabbing ${
                        isIncome
                          ? "border-emerald-200 bg-white text-emerald-700"
                          : "border-rose-200 bg-white text-rose-700"
                      } ${draggingKey === itemKey ? "opacity-50" : ""}`}
                    >
                      <span className="block truncate text-slate-800">{item.name}</span>
                      <span className="tabular-nums">{isIncome ? "+" : "-"}{money(item.amount, item.amount % 1 !== 0)}</span>
                    </span>
                  );
                })}
                {items.length > visibleItems.length && (
                  <span className="block rounded bg-white/70 px-1.5 py-1 text-[11px] font-semibold text-slate-600">
                    +{items.length - visibleItems.length} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/50 p-0 sm:items-center sm:justify-center sm:p-4">
          <form
            className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void saveEvent();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Add cash event</h2>
                <p className="mt-1 text-sm text-slate-500">{format(selectedDate, "EEEE, MMM d")}</p>
              </div>
              <button type="button" onClick={closeAddModal} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
                <button type="button" onClick={() => setType("bill")} className={`rounded px-3 py-2 text-sm font-medium ${type === "bill" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType("income");
                    setRecurrence("");
                  }}
                  className={`rounded px-3 py-2 text-sm font-medium ${type === "income" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Deposit
                </button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">{type === "income" ? "Deposit source" : "Expense name"}</span>
                <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Amount</span>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Repeats</span>
                  <select value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500">
                    {recurrenceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <button disabled={!name.trim() || !amount || saving} className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving..." : `Add ${recurrence ? "recurring " : ""}${type === "income" ? "deposit" : "expense"}`}
            </button>
          </form>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={saveEdit} className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Edit calendar item</h2>
                <p className="mt-1 text-sm text-slate-500">Changes default to this occurrence only.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
                <input value={editName} onChange={(event) => setEditName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</span>
                <input type="number" min="0" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</span>
                <input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as CommitmentInstance["status"])} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  {statuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Apply to</span>
                <select value={editScope} onChange={(event) => setEditScope(event.target.value as "instance" | "future" | "template")} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="instance">This occurrence only</option>
                  <option value="future">This and future occurrences</option>
                  <option value="template">Recurring template</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={deleteEditing} disabled={saving} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:mr-auto">
                Delete occurrence
              </button>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedDay && selectedDay.commitments.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-700">{format(selectedDate, "EEE, MMM d")} items</h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {selectedDay.commitments.map((item, index) => (
              <button
                key={`${item.commitment_id}-${item.original_due_date}-${index}`}
                type="button"
                onClick={() => startEdit(item)}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-left hover:border-sky-300 hover:bg-sky-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{item.name}</span>
                  <span className="text-xs capitalize text-slate-500">{item.status ?? "planned"}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${item.type === "income" ? "text-emerald-700" : "text-rose-700"}`}>
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
