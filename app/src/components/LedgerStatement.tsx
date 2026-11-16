"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import ActivityRow from "@/components/ui/ActivityRow";
import RowMenu from "@/components/ui/RowMenu";
import StatusDot from "@/components/ui/StatusDot";
import { CommitmentInstance, LedgerEntry, LedgerItem } from "@/lib/types";
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

type PendingFilter = "all" | "pending" | "posted";
type RecurrenceRule = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";

interface ConvertForm {
  name: string;
  amount: string;
  due_date: string;
  recurrence_rule: RecurrenceRule;
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
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ description: "", amount: "", type: "expense" });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [convertingEntry, setConvertingEntry] = useState<LedgerEntry | null>(null);
  const [convertForm, setConvertForm] = useState<ConvertForm | null>(null);
  const [convertSaving, setConvertSaving] = useState(false);
  const [linkingEntry, setLinkingEntry] = useState<LedgerEntry | null>(null);
  const [eligibleInstances, setEligibleInstances] = useState<CommitmentInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [linkInstanceKey, setLinkInstanceKey] = useState("");
  const [linkAmount, setLinkAmount] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  const accountMap = useMemo<AccountMap>(() => {
    const map: AccountMap = {};
    for (const a of accounts) map[a.id] = a.name;
    return map;
  }, [accounts]);

  const fetchEntries = useCallback(() => {
    authFetch("/api/ledger")
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

  useEffect(() => {
    if (!linkingEntry) return;

    setLoadingInstances(true);
    authFetch("/api/commitment-instances")
      .then((r) => r.json())
      .then((data: CommitmentInstance[]) => {
        const expenseInstances = data.filter((inst) => inst.commitment_type !== "income");
        setEligibleInstances(expenseInstances);

        const best = [...expenseInstances].sort((a, b) => {
          const aDiff = Math.abs((a.remaining_amount || a.planned_amount) - linkingEntry.amount);
          const bDiff = Math.abs((b.remaining_amount || b.planned_amount) - linkingEntry.amount);
          if (aDiff !== bDiff) return aDiff - bDiff;
          return a.due_date.localeCompare(b.due_date);
        })[0];

        if (best) {
          setLinkInstanceKey(`${best.commitment_id}|${best.original_due_date || best.due_date}`);
          setLinkAmount(linkingEntry.amount.toFixed(2));
        }
      })
      .catch(() => setEligibleInstances([]))
      .finally(() => setLoadingInstances(false));
  }, [linkingEntry]);

  const refreshAll = useCallback(() => {
    fetchEntries();
    onRefresh?.();
  }, [fetchEntries, onRefresh]);

  const handleDelete = async (entry: LedgerEntry) => {
    if (!confirm(`Delete "${entry.description}" for $${entry.amount.toFixed(2)}? This will reverse the account balance and any expense allocations.`))
      return;

    setActionLoading(entry.id);
    try {
      const res = await authFetch(`/api/ledger/${entry.id}`, { method: "DELETE" });
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
      const res = await authFetch(`/api/ledger/${editingId}`, {
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

  const startConvertToRecurring = (entry: LedgerEntry) => {
    setConvertingEntry(entry);
    setConvertForm({
      name: entry.description,
      amount: entry.amount.toFixed(2),
      due_date: entry.date,
      recurrence_rule: "monthly",
    });
  };

  const cancelConvert = () => {
    if (convertSaving) return;
    setConvertingEntry(null);
    setConvertForm(null);
  };

  const saveConvertToRecurring = async () => {
    if (!convertingEntry || !convertForm) return;
    const amount = parseFloat(convertForm.amount);
    if (!convertForm.name.trim() || Number.isNaN(amount) || amount <= 0 || !convertForm.due_date) {
      alert("Please enter a valid name, amount, and due date");
      return;
    }

    setConvertSaving(true);
    try {
      const res = await authFetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: convertForm.name.trim(),
          type: "bill",
          amount,
          due_date: convertForm.due_date,
          recurrence_rule: convertForm.recurrence_rule,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to create recurring expense");
        return;
      }
      setConvertingEntry(null);
      setConvertForm(null);
      refreshAll();
    } catch {
      alert("Failed to create recurring expense");
    } finally {
      setConvertSaving(false);
    }
  };

  const startLink = (entry: LedgerEntry) => {
    setLinkingEntry(entry);
    setEligibleInstances([]);
    setLinkInstanceKey("");
    setLinkAmount(entry.amount.toFixed(2));
  };

  const cancelLink = () => {
    if (linkSaving) return;
    setLinkingEntry(null);
    setEligibleInstances([]);
    setLinkInstanceKey("");
    setLinkAmount("");
  };

  const selectedLinkInstance = useMemo(() => {
    if (!linkInstanceKey) return null;
    return eligibleInstances.find((inst) => `${inst.commitment_id}|${inst.original_due_date || inst.due_date}` === linkInstanceKey) ?? null;
  }, [eligibleInstances, linkInstanceKey]);

  const saveLink = async () => {
    if (!linkingEntry || !selectedLinkInstance) return;
    const amount = parseFloat(linkAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      alert("Please enter a valid linked amount");
      return;
    }
    if (amount > linkingEntry.amount + 0.005) {
      alert("Linked amount cannot exceed the transaction amount");
      return;
    }

    setLinkSaving(true);
    try {
      const res = await authFetch(`/api/ledger/${linkingEntry.id}/allocations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocations: [
            {
              commitment_id: selectedLinkInstance.commitment_id,
              instance_due_date: selectedLinkInstance.original_due_date || selectedLinkInstance.due_date,
              amount,
            },
          ],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to link transaction");
        return;
      }
      setLinkingEntry(null);
      setEligibleInstances([]);
      setLinkInstanceKey("");
      setLinkAmount("");
      refreshAll();
    } catch {
      alert("Failed to link transaction");
    } finally {
      setLinkSaving(false);
    }
  };

  const liveEntries = useMemo(() => entries.filter((entry) => !entry.removed), [entries]);

  const filtered = useMemo(() => {
    const today = new Date();
    let result = liveEntries;

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

    if (pendingFilter !== "all") {
      result = result.filter((e) => (pendingFilter === "pending" ? Boolean(e.pending) : !e.pending));
    }

    return result;
  }, [liveEntries, dateFilter, searchQuery, customStart, customEnd, pendingFilter]);

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

  const pendingCount = useMemo(
    () => liveEntries.filter((e) => e.pending).length,
    [liveEntries]
  );

  const linkAmountNumber = parseFloat(linkAmount);
  const linkDifference =
    selectedLinkInstance && !Number.isNaN(linkAmountNumber)
      ? linkAmountNumber - selectedLinkInstance.planned_amount
      : 0;

  if (loading) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 text-center text-[var(--muted)]">
        Loading transactions...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="eyebrow">Ledger</p>
            <h2 className="mt-1 text-3xl font-medium text-[var(--text)]">Transactions</h2>
          </div>
          <div className="scroll-row">
            {(["this_week", "this_month", "last_month", "all"] as DateFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={`min-h-11 rounded-full px-3 text-xs font-medium transition-colors ${
                  dateFilter === f
                    ? "bg-[var(--text)] text-[var(--ink)]"
                    : "border border-[var(--line)] text-[var(--muted)]"
                }`}
              >
                {f === "this_week" ? "Week" : f === "this_month" ? "Month" : f === "last_month" ? "Last" : "All"}
              </button>
            ))}
            <button
              onClick={() => setDateFilter("custom")}
              className={`min-h-11 rounded-full px-3 text-xs font-medium transition-colors ${
                dateFilter === "custom"
                  ? "bg-[var(--text)] text-[var(--ink)]"
                  : "border border-[var(--line)] text-[var(--muted)]"
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
              className="rounded-lg border border-[var(--line-strong)] px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
            />
            <span className="text-xs text-[var(--muted)]">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-[var(--line-strong)] px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-[var(--accent)] outline-none"
            />
          </div>
        )}

        <div className="mt-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by description or expense..."
            className="field w-full sm:w-72"
          />
        </div>

        <div className="segment mt-3">
          {(["all", "pending", "posted"] as PendingFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={pendingFilter === f}
              onClick={() => {
                setPendingFilter(f);
                if (f === "pending") setDateFilter("all");
              }}
              className={`text-sm ${pendingFilter === f ? "is-active" : ""}`}
            >
              {f === "all" ? "All" : f === "pending" ? "Pending" : "Posted"}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-[var(--muted)]">
            Pending in ledger: <span className="font-semibold">{pendingCount}</span>
            {pendingCount > 0 ? " · matched to bills only after they post" : ""}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div>
            <p className="eyebrow">In</p>
            <p className="money mt-1 text-base text-[var(--positive)]">+${totals.income.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="eyebrow">Out</p>
            <p className="money mt-1 text-base text-[var(--text)]">−${totals.expense.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          </div>
          <div>
            <p className="eyebrow">Net</p>
            <p className="money mt-1 text-base text-[var(--text)]">
              {totals.net >= 0 ? "+" : "-"}${Math.abs(totals.net).toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-[var(--muted)]">
          No transactions found for this period.
        </div>
      ) : (
        <div className="activity-list">
          {filtered.map((entry) => {
            const allocations = entry.allocations || [];
            const items: LedgerItem[] = entry.items || [];
            const isEditing = editingId === entry.id;
            const isLoading = actionLoading === entry.id;
            const hasMultipleItems = items.length > 1;
            const isExpanded = expandedIds.has(entry.id);
            const isBillPayment = !!entry.commitment_id;
            const commitmentNames = allocations
              .map((a) => ("commitment_name" in a ? (a as { commitment_name: string }).commitment_name : ""))
              .filter(Boolean);

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
                <div key={entry.id} className="activity-edit space-y-3">
                  <p className="text-sm text-[var(--muted)]">{format(parseISO(entry.date), "MMM d, yyyy")}</p>
                  <input
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    aria-label="Description"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={editForm.type}
                      onChange={(e) => setEditForm({ ...editForm, type: e.target.value as "expense" | "income" })}
                      aria-label="Type"
                    >
                      <option value="expense">Spent</option>
                      <option value="income">Income</option>
                    </select>
                    <input
                      type="number"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      step="0.01"
                      aria-label="Amount"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveEdit} disabled={isLoading} className="btn btn-primary">
                      {isLoading ? "Saving..." : "Save"}
                    </button>
                    <button onClick={cancelEdit} disabled={isLoading} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <React.Fragment key={entry.id}>
                <ActivityRow
                  title={entry.description}
                  tone={entry.type === "income" ? "in" : "neutral"}
                  amount={`${entry.type === "income" ? "+" : "−"}$${entry.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                  subtitle={
                    <>
                      <span>
                        {format(parseISO(entry.date), "MMM d, yyyy")}
                        {" · "}
                        {accountMap[entry.account_id] || entry.account_id}
                      </span>
                      {entry.pending && <StatusDot tone="warning" label="Pending" />}
                      {isBillPayment && <StatusDot label="Bill payment" />}
                      {commitmentNames.length > 0 && <span>Linked {commitmentNames.join(", ")}</span>}
                      <span>Running ${(runningBalances.get(entry.id) ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    </>
                  }
                  trailing={
                    <>
                      {hasMultipleItems && (
                        <button type="button" onClick={toggleExpand} className="btn btn-secondary px-3" aria-expanded={isExpanded}>
                          {isExpanded ? "Hide" : `${items.length} items`}
                        </button>
                      )}
                      <RowMenu
                        label={`Actions for ${entry.description}`}
                        items={[
                          { label: "Edit", onSelect: () => startEdit(entry), disabled: isLoading },
                          ...(entry.type === "expense" && !entry.pending
                            ? [
                                { label: "Link", onSelect: () => startLink(entry), disabled: isLoading },
                                { label: "Make recurring", onSelect: () => startConvertToRecurring(entry), disabled: isLoading },
                              ]
                            : []),
                          { label: isLoading ? "Deleting..." : "Delete", tone: "danger" as const, onSelect: () => handleDelete(entry), disabled: isLoading },
                        ]}
                      />
                    </>
                  }
                />
                {hasMultipleItems && isExpanded && items.map((item) => (
                  <div key={item.id} className="activity-child">
                    <span>{item.description}{item.commitment_name ? ` · ${item.commitment_name}` : ""}</span>
                    <span className="activity-amount">${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {linkingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">Link Transaction to Expense</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {linkingEntry.description} · ${linkingEntry.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} on{" "}
              {format(parseISO(linkingEntry.date), "MMM d, yyyy")}
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Expense</label>
                <select
                  value={linkInstanceKey}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setLinkInstanceKey(nextKey);
                    const next = eligibleInstances.find((inst) => `${inst.commitment_id}|${inst.original_due_date || inst.due_date}` === nextKey);
                    if (next) setLinkAmount(linkingEntry.amount.toFixed(2));
                  }}
                  disabled={loadingInstances}
                  className="w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:bg-[var(--surface-2)]"
                >
                  <option value="">{loadingInstances ? "Loading expenses..." : "Choose an open expense"}</option>
                  {eligibleInstances.map((inst) => {
                    const key = `${inst.commitment_id}|${inst.original_due_date || inst.due_date}`;
                    return (
                      <option key={key} value={key}>
                        {inst.commitment_name} · {format(parseISO(inst.due_date), "MMM d")} · $
                        {inst.remaining_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} left
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Planned</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    {selectedLinkInstance
                      ? `$${selectedLinkInstance.planned_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "--"}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Transaction</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--text)]">
                    ${linkingEntry.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">Difference</p>
                  <p className={`mt-1 text-sm font-semibold ${linkDifference > 0.005 ? "text-[var(--warning)]" : linkDifference < -0.005 ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>
                    {selectedLinkInstance && !Number.isNaN(linkAmountNumber)
                      ? `${linkDifference >= 0 ? "+" : "-"}$${Math.abs(linkDifference).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : "--"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--muted)] mb-1">Amount to link</label>
                <input
                  type="number"
                  value={linkAmount}
                  onChange={(e) => setLinkAmount(e.target.value)}
                  min="0"
                  max={linkingEntry.amount}
                  step="0.01"
                  className="w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                {selectedLinkInstance && linkDifference > 0.005 && (
                  <p className="mt-2 text-xs text-[var(--warning)]">
                    This will set actual {selectedLinkInstance.commitment_name} to $
                    {linkAmountNumber.toLocaleString("en-US", { minimumFractionDigits: 2 })}, $
                    {linkDifference.toLocaleString("en-US", { minimumFractionDigits: 2 })} over plan.
                  </p>
                )}
                {selectedLinkInstance && linkDifference < -0.005 && (
                  <p className="mt-2 text-xs text-[var(--accent)]">
                    This will partially fund {selectedLinkInstance.commitment_name}; $
                    {Math.abs(linkDifference).toLocaleString("en-US", { minimumFractionDigits: 2 })} will remain expected.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cancelLink}
                disabled={linkSaving}
                className="px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveLink}
                disabled={linkSaving || !selectedLinkInstance || Number.isNaN(linkAmountNumber) || linkAmountNumber <= 0}
                className="px-4 py-2 text-sm font-semibold text-[var(--ink)] bg-[var(--text)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {linkSaving ? "Linking..." : "Link Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
      {convertingEntry && convertForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--text)]">Convert Transaction to Recurring Expense</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Prefilled from transaction on {format(parseISO(convertingEntry.date), "MMM d, yyyy")}.
            </p>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={convertForm.name}
                onChange={(e) => setConvertForm({ ...convertForm, name: e.target.value })}
                placeholder="Expense name"
                className="sm:col-span-2 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <input
                type="number"
                value={convertForm.amount}
                onChange={(e) => setConvertForm({ ...convertForm, amount: e.target.value })}
                step="0.01"
                placeholder="Amount"
                className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <input
                type="date"
                value={convertForm.due_date}
                onChange={(e) => setConvertForm({ ...convertForm, due_date: e.target.value })}
                className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <select
                value={convertForm.recurrence_rule}
                onChange={(e) => setConvertForm({ ...convertForm, recurrence_rule: e.target.value as RecurrenceRule })}
                className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={cancelConvert}
                disabled={convertSaving}
                className="px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveConvertToRecurring}
                disabled={convertSaving}
                className="px-4 py-2 text-sm font-semibold text-[var(--ink)] bg-[var(--text)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {convertSaving ? "Saving..." : "Create Recurring Expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
