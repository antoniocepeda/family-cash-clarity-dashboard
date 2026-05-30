"use client";

import { FormEvent, useState } from "react";
import { format, isBefore, parseISO, startOfToday } from "date-fns";
import { CommitmentInstance, ProjectionDay } from "@/lib/types";

type RangeDays = 14 | 30 | 60;
type RiskState = "safe" | "tight" | "below buffer" | "negative" | "overdue";

interface Props {
  projection: ProjectionDay[];
  rangeDays: RangeDays;
  onRangeChange: (days: RangeDays) => void;
  onUpdateInstance?: (input: {
    commitment_id: string;
    original_due_date: string;
    due_date: string;
    planned_amount: number;
    status: CommitmentInstance["status"];
    scope: "instance" | "future" | "template";
  }) => Promise<void> | void;
  bufferAmount?: number;
}

const rangeOptions: RangeDays[] = [14, 30, 60];

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const fmtExact = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function getRiskState(day: ProjectionDay, bufferAmount: number): RiskState {
  const date = parseISO(day.date);
  const hasUnpaidBills = day.commitments.some((c) => c.type !== "income");
  const hasOverdue = day.commitments.some((c) => c.status === "overdue");

  if (hasOverdue || (isBefore(date, startOfToday()) && hasUnpaidBills)) return "overdue";
  if (day.balance < 0) return "negative";
  if (day.balance < bufferAmount) return "below buffer";
  if (day.balance < bufferAmount * 1.5) return "tight";
  return "safe";
}

function riskClasses(risk: RiskState) {
  switch (risk) {
    case "negative":
      return "border-red-300 bg-red-50 text-red-700";
    case "overdue":
      return "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700";
    case "below buffer":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "tight":
      return "border-yellow-300 bg-yellow-50 text-yellow-800";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
}

type EditableItem = ProjectionDay["commitments"][number];

export default function RunwayView({ projection, rangeDays, onRangeChange, onUpdateInstance, bufferAmount = 500 }: Props) {
  const [editing, setEditing] = useState<EditableItem | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editStatus, setEditStatus] = useState<CommitmentInstance["status"]>("planned");
  const [editScope, setEditScope] = useState<"instance" | "future" | "template">("instance");
  const [saving, setSaving] = useState(false);
  const visibleDays = projection.slice(0, rangeDays);

  const startEdit = (item: EditableItem) => {
    if (!item.commitment_id) return;
    setEditing(item);
    setEditAmount(item.amount.toFixed(2));
    setEditDate(item.due_date ?? item.original_due_date ?? "");
    setEditStatus((item.status ?? "planned") as CommitmentInstance["status"]);
    setEditScope("instance");
  };

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing?.commitment_id || !onUpdateInstance) return;
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
      });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  if (visibleDays.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        No projection data available. Add accounts and commitments to see your cash runway.
      </section>
    );
  }

  const lowestDay = visibleDays.reduce((lowest, day) => (day.balance < lowest.balance ? day : lowest), visibleDays[0]);
  const firstNegativeDay = visibleDays.find((day) => day.balance < 0);
  const needForZero = Math.max(0, Math.abs(Math.min(0, lowestDay.balance)));
  const needForBuffer = Math.max(0, bufferAmount - lowestDay.balance);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Runway View</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Cash Timeline</h1>
          <p className="mt-1 text-sm text-slate-500">
            Upcoming income, bills, and projected ending balance by day.
          </p>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-slate-200 text-sm font-semibold">
          {rangeOptions.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onRangeChange(days)}
              className={`px-3 py-2 transition-colors ${
                rangeDays === days ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 py-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Lowest projected balance</p>
          <p className={`mt-1 text-xl font-bold ${lowestDay.balance < 0 ? "text-red-600" : "text-slate-900"}`}>
            {fmt(lowestDay.balance)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{format(parseISO(lowestDay.date), "EEE, MMM d")}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">First negative day</p>
          <p className={`mt-1 text-xl font-bold ${firstNegativeDay ? "text-red-600" : "text-emerald-600"}`}>
            {firstNegativeDay ? format(parseISO(firstNegativeDay.date), "MMM d") : "None"}
          </p>
          <p className="mt-1 text-xs text-slate-500">Within selected range</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Need to avoid negative</p>
          <p className={`mt-1 text-xl font-bold ${needForZero > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {fmt(needForZero)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Based on lowest balance</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Need for {fmt(bufferAmount)} buffer</p>
          <p className={`mt-1 text-xl font-bold ${needForBuffer > 0 ? "text-amber-700" : "text-emerald-600"}`}>
            {fmt(needForBuffer)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Keeps cash above buffer</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {visibleDays.map((day) => {
          const date = parseISO(day.date);
          const risk = getRiskState(day, bufferAmount);
          const income = day.commitments.filter((c) => c.type === "income");
          const bills = day.commitments.filter((c) => c.type !== "income");

          return (
            <article key={day.date} className={`rounded-xl border p-4 ${riskClasses(risk)}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {format(date, "EEE, MMM d")}
                    </h2>
                    <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold capitalize">
                      {risk}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-slate-600">
                    Projected end:{" "}
                    <span className={day.balance < 0 ? "text-red-700" : "text-slate-900"}>{fmtExact(day.balance)}</span>
                  </p>
                </div>
              </div>

              {day.commitments.length > 0 ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Income</p>
                    {income.length > 0 ? (
                      income.map((item, idx) => (
                        <button
                          key={`${day.date}-income-${idx}`}
                          type="button"
                          onClick={() => startEdit(item)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg bg-white/75 px-3 py-2 text-left transition-colors hover:bg-white"
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-slate-800">{item.name}</span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">+{fmtExact(item.amount)}</span>
                        </button>
                      ))
                    ) : (
                      <p className="rounded-lg bg-white/60 px-3 py-2 text-sm text-slate-500">No income due</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Bills</p>
                    {bills.length > 0 ? (
                      bills.map((item, idx) => (
                        <button
                          key={`${day.date}-bill-${idx}`}
                          type="button"
                          onClick={() => startEdit(item)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg bg-white/75 px-3 py-2 text-left transition-colors hover:bg-white"
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-slate-800">{item.name}</span>
                          <span className="shrink-0 text-sm font-bold tabular-nums text-rose-700">-{fmtExact(item.amount)}</span>
                        </button>
                      ))
                    ) : (
                      <p className="rounded-lg bg-white/60 px-3 py-2 text-sm text-slate-500">No bills due</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-white/60 px-3 py-2 text-sm text-slate-500">No bills or income due</p>
              )}
            </article>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-900/40 p-0 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={saveEdit} className="w-full rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{editing.name}</h2>
                <p className="mt-1 text-sm text-slate-500">Update amount, due date, status, and edit scope.</p>
              </div>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editAmount}
                  onChange={(event) => setEditAmount(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</span>
                <input
                  type="date"
                  value={editDate}
                  onChange={(event) => setEditDate(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
                <select
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as CommitmentInstance["status"])}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="planned">Planned</option>
                  <option value="paid">Paid</option>
                  <option value="partially_funded">Partially funded</option>
                  <option value="deferred">Deferred</option>
                  <option value="skipped">Skipped</option>
                  <option value="overdue">Overdue</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Edit scope</span>
                <select
                  value={editScope}
                  onChange={(event) => setEditScope(event.target.value as "instance" | "future" | "template")}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="instance">Edit this instance only</option>
                  <option value="future">Edit this and future instances</option>
                  <option value="template">Edit recurring template</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
    </section>
  );
}
