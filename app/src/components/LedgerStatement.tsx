"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { LedgerEntry, LedgerItem } from "@/lib/types";
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";

type DateFilter = "all" | "this_week" | "this_month" | "last_month" | "custom";

interface AccountMap {
  [id: string]: string;
}

interface EditForm {
  description: string;
  amount: string;
  type: "expense" | "income";
}

export default function LedgerStatement({
  accounts,
  onRefresh,
}: {
  accounts: { id: string; name: string }[];
  onRefresh?: () => void;
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilter>("this_month");
  const [searchQuery, setSearchQuery] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ description: "", amount: "", type: "expense" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const accountMap = useMemo<AccountMap>(() => {
    const map: AccountMap = {};
    for (const a of accounts) map[a.id] = a.name;
    return map;
  }, [accounts]);

  const fetchEntries = useCallback(() => {
    fetch("/api/ledger")
      .then((r) => r.json())
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const refreshAll = useCallback(() => {
    fetchEntries();
    onRefresh?.();
  }, [fetchEntries, onRefresh]);

  const handleDelete = async (entry: LedgerEntry) => {
    if (!confirm(`Delete "${entry.description}" for $${entry.amount.toFixed(2)}? This will reverse the account balance and any expense allocations.`))
      return;

    setActionLoading(entry.id);
    try {
      const res = await fetch(`/api/ledger/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete transaction");
        return;
      }
      refreshAll();
    } catch {
      alert("Failed to delete transaction");
    } finally {
      setActionLoading(null);
    }
  };

  const startEdit = (entry: LedgerEntry) => {
    setEditingId(entry.id);
    setEditForm({
      description: entry.description,
      amount: entry.amount.toString(),
      type: entry.type,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ description: "", amount: "", type: "expense" });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const amount = parseFloat(editForm.amount);
    if (!editForm.description.trim() || isNaN(amount) || amount <= 0) {
      alert("Please enter a valid description and amount");
      return;
    }

    setActionLoading(editingId);
    try {
      const res = await fetch(`/api/ledger/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editForm.description.trim(),
          amount,
          type: editForm.type,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to update transaction");
        return;
      }
      setEditingId(null);
      refreshAll();
    } catch {
      alert("Failed to update transaction");
    } finally {
      setActionLoading(null);
    }
  };

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
            placeholder="Search by description or expense..."
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
                <th className="px-5 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Linked Expenses</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Running</th>
                <th className="px-5 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((entry) => {
                const allocations = entry.allocations || [];
                const items: LedgerItem[] = entry.items || [];
                const isEditing = editingId === entry.id;
                const isLoading = actionLoading === entry.id;
                const hasMultipleItems = items.length > 1;
                const isExpanded = expandedIds.has(entry.id);
                const isBillPayment = !!entry.commitment_id;

                const toggleExpand = () => {
                  setExpandedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(entry.id)) next.delete(entry.id);
                    else next.add(entry.id);
                    return next;
                  });
                };

                if (isEditing) {
                  return (
                    <tr key={entry.id} className="bg-amber-50/50">
                      <td className="px-5 py-2 text-slate-600 whitespace-nowrap">
                        {format(parseISO(entry.date), "MMM d, yyyy")}
                      </td>
                      <td className="px-5 py-2">
                        <input
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </td>
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-1.5 justify-end">
                          <select
                            value={editForm.type}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value as "expense" | "income" })}
                            className="rounded border border-slate-300 px-1.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-sky-500"
                          >
                            <option value="expense">Spent</option>
                            <option value="income">Income</option>
                          </select>
                          <input
                            type="number"
                            value={editForm.amount}
                            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                            step="0.01"
                            className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm text-right outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-2 text-slate-500 whitespace-nowrap">
                        {accountMap[entry.account_id] || entry.account_id}
                      </td>
                      <td className="px-5 py-2 text-xs text-slate-400">--</td>
                      <td className="px-5 py-2 text-xs text-slate-400">--</td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={saveEdit}
                            disabled={isLoading}
                            className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {isLoading ? "..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isLoading}
                            className="px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const commitmentNames = allocations
                  .map((a) => ("commitment_name" in a ? (a as { commitment_name: string }).commitment_name : ""))
                  .filter(Boolean);

                const singleItemDesc = items.length === 1 ? items[0].description : null;

                return (
                  <React.Fragment key={entry.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                        {format(parseISO(entry.date), "MMM d, yyyy")}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-start gap-1.5">
                          {hasMultipleItems && (
                            <button
                              onClick={toggleExpand}
                              className="mt-0.5 shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                              title={isExpanded ? "Collapse items" : "Expand items"}
                            >
                              <svg
                                className={`h-4 w-4 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-slate-800">{entry.description}</span>
                              {isBillPayment && (
                                <span className="inline-flex text-[10px] font-semibold bg-sky-50 text-sky-600 px-1.5 py-0.5 rounded">
                                  Bill Payment
                                </span>
                              )}
                              {hasMultipleItems && (
                                <span className="text-[10px] font-medium text-slate-400">
                                  {items.length} items
                                </span>
                              )}
                            </div>
                            {singleItemDesc && singleItemDesc !== entry.description && (
                              <p className="text-xs text-slate-400 mt-0.5">{singleItemDesc}</p>
                            )}
                          </div>
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
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(entry)}
                            disabled={isLoading}
                            className="px-2.5 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry)}
                            disabled={isLoading}
                            className="px-2.5 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            {isLoading ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {hasMultipleItems && isExpanded && items.map((item) => (
                      <tr key={item.id} className="bg-slate-50/30">
                        <td className="px-5 py-2" />
                        <td className="px-5 py-2 pl-12">
                          <span className="text-xs text-slate-600">{item.description}</span>
                        </td>
                        <td className="px-5 py-2 text-right whitespace-nowrap">
                          <span className="text-xs text-slate-500">
                            ${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-5 py-2" />
                        <td className="px-5 py-2">
                          {item.commitment_name ? (
                            <span className="inline-flex text-[10px] font-medium bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full">
                              {item.commitment_name}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-5 py-2" />
                        <td className="px-5 py-2" />
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
