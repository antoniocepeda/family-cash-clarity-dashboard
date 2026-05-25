"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addDays,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isEqual,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Account, CommitmentWithInstances } from "@/lib/types";

interface NewCashEvent {
  name: string;
  amount: number;
  due_date: string;
  recurrence_rule: string;
  priority: string;
  autopay: boolean;
  account_id: string;
  type: "bill" | "income";
}

interface Props {
  accounts: Account[];
  commitments: CommitmentWithInstances[];
  onAddEvent: (expense: NewCashEvent) => Promise<void>;
}

const recurrenceOptions = [
  { value: "", label: "One-time" },
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Yearly" },
];

function advanceByRule(base: Date, rule: string): Date {
  if (rule.startsWith("every_")) {
    if (rule.endsWith("_days")) {
      const days = parseInt(rule.slice(6, -5), 10);
      if (!isNaN(days) && days > 0) return addDays(base, days);
    }
    if (rule.endsWith("_weeks")) {
      const weeks = parseInt(rule.slice(6, -6), 10);
      if (!isNaN(weeks) && weeks > 0) return addWeeks(base, weeks);
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

export default function CashCalendar({ accounts, commitments, onAddEvent }: Props) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [type, setType] = useState<"bill" | "income">("bill");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [recurrence, setRecurrence] = useState("monthly");
  const [priority, setPriority] = useState("normal");
  const [autopay, setAutopay] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accounts]);

  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(month)),
        end: endOfWeek(endOfMonth(month)),
      }),
    [month]
  );

  const eventsByDate = useMemo(() => {
    const dates = new Map<string, { bills: number; deposits: number }>();
    const calendarStart = calendarDays[0];
    const calendarEnd = calendarDays[calendarDays.length - 1];

    const addOccurrence = (date: Date, type: "bill" | "income") => {
      const dateKey = format(date, "yyyy-MM-dd");
      const eventCounts = dates.get(dateKey) || { bills: 0, deposits: 0 };
      if (type === "bill") eventCounts.bills += 1;
      else eventCounts.deposits += 1;
      dates.set(dateKey, eventCounts);
    };

    for (const commitment of commitments) {
      if (!commitment.active) continue;
      let occurrence = startOfDay(parseISO(commitment.due_date));

      if (!commitment.recurrence_rule) {
        if (!isBefore(occurrence, calendarStart) && !isAfter(occurrence, calendarEnd)) {
          addOccurrence(occurrence, commitment.type);
        }
        continue;
      }

      while (isBefore(occurrence, calendarStart)) {
        occurrence = advanceByRule(occurrence, commitment.recurrence_rule);
      }
      while (isBefore(occurrence, calendarEnd) || isEqual(occurrence, calendarEnd)) {
        addOccurrence(occurrence, commitment.type);
        occurrence = advanceByRule(occurrence, commitment.recurrence_rule);
      }
    }
    return dates;
  }, [calendarDays, commitments]);

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
        priority,
        autopay,
        account_id: accountId,
        type,
      });
      setName("");
      setAmount("");
      setRecurrence(type === "income" ? "" : "monthly");
      setPriority("normal");
      setAutopay(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border-b border-slate-200 pb-6">
      <p className="mb-4 text-sm text-slate-500">Pick a date to add money going out or a deposit coming in.</p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Previous month"
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <span aria-hidden="true">&lt;</span>
            </button>
            <h2 className="text-base font-semibold text-slate-800">{format(month, "MMMM yyyy")}</h2>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label="Next month"
              className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            >
              <span aria-hidden="true">&gt;</span>
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase text-slate-400">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day} className="py-2">{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const eventCounts = eventsByDate.get(dateKey);
              const selected = isSameDay(day, selectedDate);

              return (
                <button
                  type="button"
                  key={dateKey}
                  onClick={() => setSelectedDate(day)}
                  aria-pressed={selected}
                  className={`relative flex aspect-square min-h-12 flex-col items-center justify-center rounded-md border text-sm transition-colors ${
                    selected
                      ? "border-sky-600 bg-sky-600 font-semibold text-white"
                      : isSameMonth(day, month)
                      ? "border-slate-100 text-slate-700 hover:border-sky-200 hover:bg-sky-50"
                      : "border-transparent text-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {format(day, "d")}
                  {eventCounts && (
                    <span className="absolute bottom-1 flex gap-1">
                      {eventCounts.bills > 0 && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-white" : "bg-rose-400"}`}
                          title={`${eventCounts.bills} expense${eventCounts.bills === 1 ? "" : "s"} starts on this date`}
                        />
                      )}
                      {eventCounts.deposits > 0 && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-emerald-100" : "bg-emerald-500"}`}
                          title={`${eventCounts.deposits} deposit${eventCounts.deposits === 1 ? "" : "s"} starts on this date`}
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <form
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEvent();
          }}
        >
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-800">Add cash event</h2>
            <span className="text-sm font-medium text-sky-700">{format(selectedDate, "EEE, MMM d")}</span>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setType("bill");
                  if (!recurrence) setRecurrence("monthly");
                }}
                className={`rounded px-3 py-2 text-sm font-medium ${type === "bill" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => {
                  setType("income");
                  setRecurrence("");
                  setAutopay(false);
                }}
                className={`rounded px-3 py-2 text-sm font-medium ${type === "income" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                Deposit
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{type === "income" ? "Deposit source" : "Expense name"}</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={type === "income" ? "Paycheck, Uber payout, odd job" : "Rent, phone, streaming"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Repeats</label>
                <select
                  value={recurrence}
                  onChange={(event) => setRecurrence(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                >
                  {recurrenceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={`grid gap-3 ${type === "bill" ? "grid-cols-2" : "grid-cols-1"}`}>
              {type === "bill" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Priority</label>
                  <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="critical">Critical</option>
                    <option value="normal">Normal</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Account</label>
                <select
                  value={accountId}
                  onChange={(event) => setAccountId(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
                >
                  <option value="">No account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>
            </div>
            {type === "bill" && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={autopay}
                  onChange={(event) => setAutopay(event.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Autopay
              </label>
            )}
          </div>
          <button
            disabled={!name.trim() || !amount || saving}
            className="mt-4 w-full rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Adding..." : `Add ${recurrence ? "recurring " : ""}${type === "income" ? "deposit" : "expense"}`}
          </button>
        </form>
      </div>
    </section>
  );
}
