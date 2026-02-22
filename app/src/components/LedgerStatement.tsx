"use client";

import { useState, useEffect, useMemo } from "react";
import { LedgerEntry } from "@/lib/types";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";

type DateFilter = "all" | "this_week" | "this_month" | "last_month" | "custom";

interface AccountMap {
  [id: string]: string;
}

export default function LedgerStatement({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_month");
  const [searchQuery, setSearchQuery] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const accountMap = useMemo<AccountMap>(() => {
    const map: AccountMap = {};
    for (const a of accounts) map[a.id] = a.name;
    return map;
  }, [accounts]);

  useEffect(() => {
    fetch("/api/ledger")
      .then((r) => r.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const today = new Date();
    let result = entries;

    if (dateFilter !== "all") {
      result = result.filter((e) => {
        const d = parseISO(e.date);
        switch (dateFilter) {
          case "this_week":
            return isWithinInterval(d, { start: startOfWeek(today, { weekStartsOn: 0 }), end: endOfWeek(today, { weekStartsOn: 0 }) });
          case "this_month":
            return isWithinInterval(d, { start: startOfMonth(today), end: endOfMonth(today) });
          case "last_month": {
            const prev = subMonths(today, 1);
            return isWithinInterval(d, { start: startOfMonth(prev), end: endOfMonth(prev) });
          }
          case "custom":
            if (customStart && customEnd) {
              return isWithinInterval(d, { start: parseISO(customStart), end: parseISO(customEnd) });
            }
            return true;
          default:
            return true;
        }
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.allocations?.some((a) => ("commitment_name" in a ? (a as { commitment_name: string }).commitment_name : "").toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, dateFilter, searchQuery, customStart, customEnd]);

  const runningBalances = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
    let running = 0;
    const balances = new Map<string, number>();
    for (const e of sorted) {
      running += e.type === "income" ? e.amount : -e.amount;
      balances.set(e.id, running);
    }
    return balances;
  }, [filtered]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const e of filtered) {
      if (e.type === "income") income += e.amount;
      else expense += e.amount;
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
        Loading transactions...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Transaction Ledger</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {(["this_week", "this_month", "last_month", "all"] as DateFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                  dateFilter === f
                    ? "bg-sky-100 text-sky-700"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {f === "this_week" ? "This Week" : f === "this_month" ? "This Month" : f === "last_month" ? "Last Month" : "All"}
              </button>
            ))}
            <button
              onClick={() => setDateFilter("custom")}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                dateFilter === "custom"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        {dateFilter === "custom" && (
          <div className="flex items-center gap-2 mt-3">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
        )}

        <div className="mt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by description or commitment..."
            className="w-full sm:w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs">
          <span className="text-emerald-600 font-medium">
            Income: +${totals.income.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span className="text-rose-600 font-medium">
            Spent: -${totals.expense.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
          <span className={`font-semibold ${totals.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            Net: {totals.net >= 0 ? "+" : "-"}${Math.abs(totals.net).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">
          No transactions found for this period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/50">
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Account</th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Linked Commitments</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Running</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((entry) => {
                const allocations = entry.allocations || [];
                const commitmentNames = allocations
                  .map((a) => ("commitment_name" in a ? (a as { commitment_name: string }).commitment_name : ""))
                  .filter(Boolean);

                return (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                      {format(parseISO(entry.date), "MMM d, yyyy")}
                    </td>
                    <td className="px-5 py-3">
                      <div>
                        <span className="font-medium text-slate-800">{entry.description}</span>
                        {allocations.length > 0 && allocations.some((a) => a.note) && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {allocations.map((a) => a.note).filter(Boolean).join(", ")}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <span className={`font-semibold ${entry.type === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                        {entry.type === "income" ? "+" : "-"}$
                        {entry.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                      {accountMap[entry.account_id] || entry.account_id}
                    </td>
                    <td className="px-5 py-3">
                      {commitmentNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {allocations.map((a, i) => {
                            const name = "commitment_name" in a ? (a as { commitment_name: string }).commitment_name : "";
                            if (!name) return null;
                            return (
                              <span
                                key={i}
                                className="inline-flex text-[10px] font-medium bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full"
                              >
                                {name} (${a.amount.toFixed(2)})
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-300">--</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <span className={`text-xs font-medium ${(runningBalances.get(entry.id) ?? 0) >= 0 ? "text-slate-600" : "text-rose-600"}`}>
                        ${(runningBalances.get(entry.id) ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
