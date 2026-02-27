"use client";

import { useState, useEffect } from "react";
import { Account, AllocationInput, LedgerItemInput, CommitmentInstance } from "@/lib/types";

interface Props {
  accounts: Account[];
  onAddCommitment: (data: {
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
    items: LedgerItemInput[];
  }) => void;
}

type ModalType = "commitment" | "reconcile" | "account" | "transaction" | null;

export default function QuickActions({ accounts, onAddCommitment, onReconcile, onAddAccount, onLogTransaction }: Props) {
  const [modal, setModal] = useState<ModalType>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setModal("commitment")}
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

      {modal === "commitment" && (
        <CommitmentModal
          accounts={accounts}
          onClose={() => setModal(null)}
          onSubmit={(data) => {
            onAddCommitment(data);
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
        <TransactionWizard
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
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function CommitmentModal({
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
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"days" | "weeks">("days");
  const isCustom = form.recurrence_rule === "custom";
  const effectiveRule = isCustom && customValue ? `every_${customValue}_${customUnit}` : form.recurrence_rule;

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Bill or Income</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
              <option value="bill">Bill / Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
              <option value="critical">Critical</option>
              <option value="normal">Normal</option>
              <option value="flexible">Flexible</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Electric Bill" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount ($)</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" min="0" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
            <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Recurrence</label>
            <select value={isCustom ? "custom" : form.recurrence_rule} onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom (every N days)</option>
            </select>
          </div>
          {isCustom ? (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Every how many?</label>
              <div className="flex gap-2">
                <input type="number" value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="e.g., 6" min="1" step="1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
                <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as "days" | "weeks")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
                {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </select>
            </div>
          )}
        </div>
        {isCustom && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Account</label>
            <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.autopay} onChange={(e) => setForm({ ...form, autopay: e.target.checked })} className="rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
          Autopay enabled
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
        <button onClick={() => onSubmit({ ...form, recurrence_rule: effectiveRule, amount: parseFloat(form.amount) || 0 })} disabled={!form.name || !form.amount || (isCustom && !customValue)} className="px-5 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
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
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
            {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name} — ${a.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</option>))}
          </select>
        </div>
        {selected && (<p className="text-sm text-slate-500">Current balance: <strong>${selected.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></p>)}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Actual Balance ($)</label>
          <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="Enter what your bank shows" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
        <button onClick={() => onSubmit(accountId, parseFloat(balance))} disabled={!balance} className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Update Balance</button>
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
  const [form, setForm] = useState({ name: "", type: "checking", current_balance: "", is_reserve: false });

  return (
    <Overlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Add Account</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Account Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Main Checking" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none">
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Balance ($)</label>
            <input type="number" value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: e.target.value })} placeholder="0.00" step="0.01" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={form.is_reserve} onChange={(e) => setForm({ ...form, is_reserve: e.target.checked })} className="rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
          Reserve account (excluded from &ldquo;True Available&rdquo;)
        </label>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
        <button onClick={() => onSubmit({ ...form, current_balance: parseFloat(form.current_balance) || 0 })} disabled={!form.name} className="px-5 py-2 text-sm font-semibold text-white bg-slate-700 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Add Account</button>
      </div>
    </Overlay>
  );
}

/* ─── Transaction Wizard (2-step) ─── */

interface ItemRow {
  key: number;
  description: string;
  amount: string;
  instanceKey: string;
}

function TransactionWizard({
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
    items: LedgerItemInput[];
  }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [storeName, setStoreName] = useState("");
  const [type, setType] = useState("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [items, setItems] = useState<ItemRow[]>([{ key: 0, description: "", amount: "", instanceKey: "" }]);
  const [nextKey, setNextKey] = useState(1);
  const [eligibleInstances, setEligibleInstances] = useState<CommitmentInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);

  useEffect(() => {
    fetch("/api/commitment-instances")
      .then((r) => r.json())
      .then((data: CommitmentInstance[]) => {
        setEligibleInstances(data);
        setLoadingInstances(false);
      })
      .catch(() => setLoadingInstances(false));
  }, []);

  const addItem = () => {
    setItems([...items, { key: nextKey, description: "", amount: "", instanceKey: "" }]);
    setNextKey(nextKey + 1);
  };

  const removeItem = (key: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((i) => i.key !== key));
  };

  const updateItem = (key: number, field: keyof ItemRow, value: string) => {
    setItems(items.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const totalAmount = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const itemsWithAllocations = items.filter((i) => i.instanceKey && (parseFloat(i.amount) || 0) > 0);

  const allItemsValid = items.every((i) => {
    const amt = parseFloat(i.amount) || 0;
    if (amt <= 0 || !i.description) return false;
    if (i.instanceKey) {
      const inst = eligibleInstances.find((ei) => `${ei.commitment_id}|${ei.due_date}` === i.instanceKey);
      if (!inst) return false;
    }
    return true;
  });

  const canSubmit = storeName.trim() && items.length > 0 && totalAmount > 0 && allItemsValid;

  const buildAllocations = (): AllocationInput[] => {
    const grouped = new Map<string, { commitment_id: string; instance_due_date: string; amount: number; notes: string[] }>();

    for (const item of itemsWithAllocations) {
      const [commitment_id, instance_due_date] = item.instanceKey.split("|");
      const amt = parseFloat(item.amount) || 0;

      const existing = grouped.get(item.instanceKey);
      if (existing) {
        existing.amount += amt;
        if (item.description) existing.notes.push(item.description);
      } else {
        grouped.set(item.instanceKey, {
          commitment_id,
          instance_due_date,
          amount: amt,
          notes: item.description ? [item.description] : [],
        });
      }
    }

    return Array.from(grouped.values()).map((g) => ({
      commitment_id: g.commitment_id,
      instance_due_date: g.instance_due_date,
      amount: g.amount,
      note: g.notes.join(", ") || undefined,
    }));
  };

  const buildItems = (): LedgerItemInput[] => {
    return items
      .filter((i) => i.description && (parseFloat(i.amount) || 0) > 0)
      .map((i) => {
        const parts = i.instanceKey ? i.instanceKey.split("|") : [];
        return {
          description: i.description,
          amount: parseFloat(i.amount) || 0,
          commitment_id: parts[0] || undefined,
          instance_due_date: parts[1] || undefined,
        };
      });
  };

  const handleSubmit = () => {
    const allocations = buildAllocations();
    const allocTotal = allocations.reduce((s, a) => s + a.amount, 0);
    const hasAllocations = allocations.length > 0;
    const lineItems = buildItems();

    if (hasAllocations && Math.abs(allocTotal - totalAmount) > 0.005) {
      onSubmit({
        description: storeName,
        amount: totalAmount,
        type,
        account_id: accountId,
        allocations: [],
        items: lineItems,
      });
    } else {
      onSubmit({
        description: storeName,
        amount: totalAmount,
        type,
        account_id: accountId,
        allocations,
        items: lineItems,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">

        {step === 1 && (
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800">Where are you shopping?</h3>
                <p className="text-xs text-slate-400">Step 1 of 2</p>
              </div>
            </div>

            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && storeName.trim()) setStep(2); }}
              placeholder="e.g., Costco, Amazon, Target, Walmart"
              autoFocus
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
            />

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!storeName.trim()}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <>
            <div className="p-6 pb-0">
              <div className="flex items-center gap-3 mb-1">
                <button
                  onClick={() => setStep(1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                  title="Back to store name"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-800">What are you buying?</h3>
                  <p className="text-xs text-slate-400">
                    Shopping at <span className="font-medium text-amber-600">{storeName}</span> · Step 2 of 2
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {items.map((item, idx) => (
                <div key={item.key} className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Item {idx + 1}</span>
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(item.key)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                        title="Remove item"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, "description", e.target.value)}
                    placeholder="What did you buy?"
                    autoFocus={idx === items.length - 1}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateItem(item.key, "amount", e.target.value)}
                        placeholder="How much? ($)"
                        min="0"
                        step="0.01"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                      />
                    </div>
                    <div>
                      <select
                        value={item.instanceKey}
                        onChange={(e) => updateItem(item.key, "instanceKey", e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                      >
                        <option value="">No expense</option>
                        {!loadingInstances && eligibleInstances.map((inst) => {
                          const key = `${inst.commitment_id}|${inst.due_date}`;
                          return (
                            <option key={key} value={key}>
                              {inst.commitment_name} — {inst.due_date} (${inst.remaining_amount.toFixed(2)} left)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={addItem}
                className="w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-300 py-3 text-sm font-medium text-slate-400 hover:text-amber-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add another item
              </button>
            </div>

            <div className="border-t border-slate-200 p-6 pt-4 space-y-3 bg-white rounded-b-2xl">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Total</span>
                <span className="text-lg font-bold text-slate-800">
                  ${totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Account</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — ${a.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                  >
                    <option value="expense">Spent</option>
                    <option value="income">Received</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Log It
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
