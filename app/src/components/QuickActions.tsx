"use client";

import { useState, useEffect } from "react";
import { Account, AllocationInput, EventInstance } from "@/lib/types";

interface Props {
  accounts: Account[];
  onAddEvent: (data: {
    name: string;
    type: string;
    amount: number;
    due_date: string;
    recurrence_rule: string;
    priority: string;
    autopay: boolean;
    account_id: string;
  }) => void;
  onReconcile: (id: string, balance: number) => void;
  onAddAccount: (data: { name: string; type: string; current_balance: number; is_reserve: boolean }) => void;
  onLogTransaction: (data: {
    description: string;
    amount: number;
    type: string;
    account_id: string;
    allocations: AllocationInput[];
  }) => void;
}

type ModalType = "event" | "reconcile" | "account" | "transaction" | null;

export default function QuickActions({ accounts, onAddEvent, onReconcile, onAddAccount, onLogTransaction }: Props) {
  const [modal, setModal] = useState<ModalType>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setModal("event")}
          className="flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Bill / Income
        </button>
        <button
          onClick={() => setModal("reconcile")}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Sync with Bank
        </button>
        <button
          onClick={() => setModal("transaction")}
          className="flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
          </svg>
          Log Transaction
        </button>
        <button
          onClick={() => setModal("account")}
          className="flex items-center gap-2 rounded-xl bg-slate-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          Add Account
        </button>
      </div>

      {modal === "event" && (
        <EventModal
          accounts={accounts}
          onClose={() => setModal(null)}
          onSubmit={(data) => {
            onAddEvent(data);
            setModal(null);
          }}
        />
      )}
      {modal === "reconcile" && (
        <ReconcileModal
          accounts={accounts}
          onClose={() => setModal(null)}
          onSubmit={(id, balance) => {
            onReconcile(id, balance);
            setModal(null);
          }}
        />
      )}
      {modal === "transaction" && (
        <TransactionModal
          accounts={accounts}
          onClose={() => setModal(null)}
          onSubmit={(data) => {
            onLogTransaction(data);
            setModal(null);
          }}
        />
      )}
      {modal === "account" && (
        <AccountModal
          onClose={() => setModal(null)}
          onSubmit={(data) => {
            onAddAccount(data);
            setModal(null);
          }}
        />
      )}
    </>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function EventModal({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    type: string;
    amount: number;
    due_date: string;
    recurrence_rule: string;
    priority: string;
    autopay: boolean;
    account_id: string;
  }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "bill",
    amount: "",
    due_date: new Date().toISOString().slice(0, 10),
    recurrence_rule: "",
    priority: "normal",
    autopay: false,
    account_id: accounts[0]?.id || "",
  });

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Bill or Income</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              <option value="bill">Bill / Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              <option value="critical">Critical</option>
              <option value="normal">Normal</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Electric Bill"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount ($)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Recurrence</label>
            <select
              value={form.recurrence_rule}
              onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
            <select
              value={form.account_id}
              onChange={(e) => setForm({ ...form, account_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.autopay}
            onChange={(e) => setForm({ ...form, autopay: e.target.checked })}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Autopay enabled
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSubmit({
              ...form,
              amount: parseFloat(form.amount) || 0,
            })
          }
          disabled={!form.name || !form.amount}
          className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add {form.type === "income" ? "Income" : "Bill"}
        </button>
      </div>
    </Overlay>
  );
}

function ReconcileModal({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (id: string, balance: number) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [balance, setBalance] = useState("");

  const selected = accounts.find((a) => a.id === accountId);

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Sync with Bank</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — ${a.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </option>
            ))}
          </select>
        </div>
        {selected && (
          <p className="text-sm text-slate-500">
            Current balance: <strong>${selected.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong>
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Actual Balance ($)</label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="Enter what your bank shows"
            step="0.01"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSubmit(accountId, parseFloat(balance))}
          disabled={!balance}
          className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Update Balance
        </button>
      </div>
    </Overlay>
  );
}

function AccountModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; type: string; current_balance: number; is_reserve: boolean }) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    type: "checking",
    current_balance: "",
    is_reserve: false,
  });

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Account</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Account Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g., Main Checking"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Balance ($)</label>
            <input
              type="number"
              value={form.current_balance}
              onChange={(e) => setForm({ ...form, current_balance: e.target.value })}
              placeholder="0.00"
              step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_reserve}
            onChange={(e) => setForm({ ...form, is_reserve: e.target.checked })}
            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          />
          Reserve account (excluded from &ldquo;True Available&rdquo;)
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSubmit({
              ...form,
              current_balance: parseFloat(form.current_balance) || 0,
            })
          }
          disabled={!form.name}
          className="px-5 py-2 text-sm font-semibold text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add Account
        </button>
      </div>
    </Overlay>
  );
}

interface AllocRow {
  key: number;
  instanceKey: string;
  amount: string;
  note: string;
}

function TransactionModal({
  accounts,
  onClose,
  onSubmit,
}: {
  accounts: Account[];
  onClose: () => void;
  onSubmit: (data: {
    description: string;
    amount: number;
    type: string;
    account_id: string;
    allocations: AllocationInput[];
  }) => void;
}) {
  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "expense",
    account_id: accounts[0]?.id || "",
  });

  const [eligibleInstances, setEligibleInstances] = useState<EventInstance[]>([]);
  const [allocRows, setAllocRows] = useState<AllocRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [loadingInstances, setLoadingInstances] = useState(true);

  useEffect(() => {
    fetch("/api/event-instances")
      .then((r) => r.json())
      .then((data: EventInstance[]) => {
        setEligibleInstances(data);
        setLoadingInstances(false);
      })
      .catch(() => setLoadingInstances(false));
  }, []);

  const txAmount = parseFloat(form.amount) || 0;
  const allocTotal = allocRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const unallocated = txAmount - allocTotal;
  const isFullyAllocated = allocRows.length > 0 && Math.abs(unallocated) < 0.005;
  const hasAllocations = allocRows.length > 0;

  const allAllocsValid = allocRows.every((r) => {
    const amt = parseFloat(r.amount) || 0;
    if (amt <= 0 || !r.instanceKey) return false;
    const inst = eligibleInstances.find((i) => `${i.event_id}|${i.due_date}` === r.instanceKey);
    if (!inst) return false;
    return amt <= inst.remaining_amount + 0.005;
  });

  const canSave =
    form.description &&
    txAmount > 0 &&
    (!hasAllocations || (isFullyAllocated && allAllocsValid));

  const addAllocRow = () => {
    setAllocRows([...allocRows, { key: nextKey, instanceKey: "", amount: "", note: "" }]);
    setNextKey(nextKey + 1);
  };

  const removeAllocRow = (key: number) => {
    setAllocRows(allocRows.filter((r) => r.key !== key));
  };

  const updateAllocRow = (key: number, field: "instanceKey" | "amount" | "note", value: string) => {
    setAllocRows(allocRows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const buildAllocations = (): AllocationInput[] => {
    return allocRows.map((r) => {
      const [event_id, instance_due_date] = r.instanceKey.split("|");
      return { event_id, instance_due_date, amount: parseFloat(r.amount) || 0, note: r.note || undefined };
    });
  };

  const usedInstanceKeys = new Set(allocRows.map((r) => r.instanceKey).filter(Boolean));

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Log Transaction</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">What was it?</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g., Costco run, Gas, Lunch"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount ($)</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              <option value="expense">Spent</option>
              <option value="income">Received</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">From Account</label>
          <select
            value={form.account_id}
            onChange={(e) => setForm({ ...form, account_id: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — ${a.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </option>
            ))}
          </select>
        </div>

        {/* Allocation Section */}
        <div className="border-t border-slate-200 pt-3 mt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Allocate to Events
            </label>
            <button
              type="button"
              onClick={addAllocRow}
              disabled={loadingInstances || eligibleInstances.length === 0}
              className="text-xs font-medium text-amber-600 hover:text-amber-800 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              + Add Split
            </button>
          </div>

          {loadingInstances && (
            <p className="text-xs text-slate-400 italic">Loading events...</p>
          )}

          {!loadingInstances && eligibleInstances.length === 0 && (
            <p className="text-xs text-slate-400 italic">No upcoming events to allocate to.</p>
          )}

          {allocRows.map((row) => {
            const selectedInst = eligibleInstances.find(
              (i) => `${i.event_id}|${i.due_date}` === row.instanceKey
            );
            const rowAmt = parseFloat(row.amount) || 0;
            const overRemaining = selectedInst && rowAmt > selectedInst.remaining_amount + 0.005;

            return (
              <div key={row.key} className="mb-3 rounded-lg border border-slate-200 p-2 space-y-1.5">
                <div className="flex items-start gap-2">
                  <select
                    value={row.instanceKey}
                    onChange={(e) => updateAllocRow(row.key, "instanceKey", e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    <option value="">Select event...</option>
                    {eligibleInstances.map((inst) => {
                      const key = `${inst.event_id}|${inst.due_date}`;
                      const isUsed = usedInstanceKeys.has(key) && key !== row.instanceKey;
                      return (
                        <option key={key} value={key} disabled={isUsed}>
                          {inst.event_name} — {inst.due_date} (${inst.remaining_amount.toFixed(2)} left)
                        </option>
                      );
                    })}
                  </select>
                  <input
                    type="number"
                    value={row.amount}
                    onChange={(e) => updateAllocRow(row.key, "amount", e.target.value)}
                    placeholder="$"
                    min="0"
                    step="0.01"
                    className={`w-24 rounded-lg border px-2 py-1.5 text-xs focus:ring-2 outline-none ${
                      overRemaining
                        ? "border-red-400 focus:ring-red-400 focus:border-red-400"
                        : "border-slate-300 focus:ring-amber-500 focus:border-amber-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => removeAllocRow(row.key)}
                    className="text-slate-400 hover:text-red-500 transition-colors p-1"
                    title="Remove"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <input
                  value={row.note}
                  onChange={(e) => updateAllocRow(row.key, "note", e.target.value)}
                  placeholder="What was this for? (optional)"
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                />
              </div>
            );
          })}

          {hasAllocations && txAmount > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Transaction total</span>
                <span className="font-medium text-slate-700">${txAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Allocated</span>
                <span className="font-medium text-slate-700">${allocTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className={`font-semibold ${Math.abs(unallocated) < 0.005 ? "text-emerald-600" : "text-amber-600"}`}>
                  {Math.abs(unallocated) < 0.005 ? "Fully allocated" : `$${unallocated.toFixed(2)} left to allocate`}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-5">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onSubmit({
              description: form.description,
              amount: txAmount,
              type: form.type,
              account_id: form.account_id,
              allocations: hasAllocations ? buildAllocations() : [],
            })
          }
          disabled={!canSave}
          className="px-5 py-2 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Log It
        </button>
      </div>
    </Overlay>
  );
}
