"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import { Account, Commitment } from "@/lib/types";

type Tab = "accounts" | "commitments" | "help";

export default function ManagePage() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [acctRes, cmtRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/commitments"),
    ]);
    setAccounts(await acctRes.json());
    setCommitments(await cmtRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6 flex-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Manage Your Data</h1>
          <span className="text-xs text-slate-400">
            {accounts.length} accounts &middot; {commitments.length} expenses
          </span>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(["accounts", "commitments", "help"] as Tab[]).map((t) => {
            const label = t === "commitments" ? "expenses" : t;
            return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              } ${t === "help" ? "flex items-center gap-1.5" : "capitalize"}`}
            >
              {t === "help" && (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              )}
              {t === "help" ? "Help & Guide" : label}
            </button>
            );
          })}
        </div>

        {tab === "accounts" && (
          <AccountsManager accounts={accounts} onRefresh={fetchData} />
        )}
        {tab === "commitments" && (
          <CommitmentsManager commitments={commitments} accounts={accounts} onRefresh={fetchData} />
        )}
        {tab === "help" && <HelpGuide />}

        {tab !== "help" && <DangerZone onRefresh={fetchData} />}
      </main>
    </>
  );
}

/* ─── Accounts Manager ─── */

function AccountsManager({
  accounts,
  onRefresh,
}: {
  accounts: Account[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Account>>({});
  const [adding, setAdding] = useState(false);
  const [newAcct, setNewAcct] = useState({
    name: "",
    type: "checking" as string,
    current_balance: "",
    is_reserve: false,
  });

  const startEdit = (acct: Account) => {
    setEditing(acct.id);
    setForm({ ...acct });
  };

  const saveEdit = async () => {
    if (!form.id) return;
    await fetch("/api/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setEditing(null);
    onRefresh();
  };

  const deleteAccount = async (id: string) => {
    if (!confirm("Delete this account? Expenses linked to it will lose their account reference."))
      return;
    await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    onRefresh();
  };

  const addAccount = async () => {
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newAcct,
        current_balance: parseFloat(newAcct.current_balance) || 0,
      }),
    });
    setAdding(false);
    setNewAcct({ name: "", type: "checking", current_balance: "", is_reserve: false });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Accounts</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="text-sm font-medium text-sky-600 hover:text-sky-800 transition-colors"
        >
          {adding ? "Cancel" : "+ Add Account"}
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              value={newAcct.name}
              onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })}
              placeholder="Account name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
            <select
              value={newAcct.type}
              onChange={(e) => setNewAcct({ ...newAcct, type: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
            </select>
            <input
              type="number"
              value={newAcct.current_balance}
              onChange={(e) => setNewAcct({ ...newAcct, current_balance: e.target.value })}
              placeholder="Balance"
              step="0.01"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={newAcct.is_reserve}
                  onChange={(e) => setNewAcct({ ...newAcct, is_reserve: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Reserve
              </label>
              <button
                onClick={addAccount}
                disabled={!newAcct.name}
                className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Balance</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Reserve</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Updated</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {accounts.map((acct) =>
              editing === acct.id ? (
                <tr key={acct.id} className="bg-amber-50/50">
                  <td className="px-5 py-2">
                    <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                  </td>
                  <td className="px-5 py-2">
                    <select value={form.type || "checking"} onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })} className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500">
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                      <option value="cash">Cash</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td className="px-5 py-2">
                    <input type="number" value={form.current_balance ?? 0} onChange={(e) => setForm({ ...form, current_balance: parseFloat(e.target.value) })} step="0.01" className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                  </td>
                  <td className="px-5 py-2">
                    <input type="checkbox" checked={!!form.is_reserve} onChange={(e) => setForm({ ...form, is_reserve: e.target.checked ? 1 : 0 })} className="rounded border-slate-300" />
                  </td>
                  <td className="px-5 py-2 text-xs text-slate-400">—</td>
                  <td className="px-5 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={saveEdit} className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">Save</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={acct.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">{acct.name}</td>
                  <td className="px-5 py-3 capitalize text-slate-600">{acct.type}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800 tabular-nums">${acct.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3">
                    {acct.is_reserve ? (
                      <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Reserve</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">{new Date(acct.updated_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(acct)} className="px-3 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors">Edit</button>
                      <button onClick={() => deleteAccount(acct.id)} className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {accounts.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">No accounts yet. Add your first account above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Commitments Manager ─── */

function CommitmentsManager({
  commitments,
  accounts,
  onRefresh,
}: {
  commitments: Commitment[];
  accounts: Account[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Commitment>>({});
  const [adding, setAdding] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"days" | "weeks">("days");
  const [editCustomValue, setEditCustomValue] = useState("");
  const [editCustomUnit, setEditCustomUnit] = useState<"days" | "weeks">("days");
  const [newCmt, setNewCmt] = useState({
    name: "",
    type: "bill" as string,
    amount: "",
    due_date: new Date().toISOString().slice(0, 10),
    recurrence_rule: "",
    priority: "normal",
    autopay: false,
    account_id: "",
  });

  const isCustomRule = (rule: string | null | undefined) =>
    rule?.startsWith("every_") && (rule?.endsWith("_days") || rule?.endsWith("_weeks"));

  const parseCustom = (rule: string): { value: string; unit: "days" | "weeks" } => {
    if (rule.endsWith("_weeks")) return { value: rule.slice(6, -6), unit: "weeks" };
    return { value: rule.slice(6, -5), unit: "days" };
  };

  const formatRecurrence = (rule: string | null) => {
    if (!rule) return "One-time";
    if (isCustomRule(rule)) {
      const { value, unit } = parseCustom(rule);
      return `Every ${value} ${unit}`;
    }
    return rule;
  };

  const startEdit = (cmt: Commitment) => {
    setEditing(cmt.id);
    setForm({ ...cmt });
    if (isCustomRule(cmt.recurrence_rule)) {
      const parsed = parseCustom(cmt.recurrence_rule!);
      setEditCustomValue(parsed.value);
      setEditCustomUnit(parsed.unit);
    } else {
      setEditCustomValue("");
      setEditCustomUnit("days");
    }
  };

  const saveEdit = async () => {
    if (!form.id) return;
    const effectiveRule = (form.recurrence_rule === "custom" || isCustomRule(form.recurrence_rule)) && editCustomValue
      ? `every_${editCustomValue}_${editCustomUnit}`
      : form.recurrence_rule;
    await fetch("/api/commitments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, recurrence_rule: effectiveRule }),
    });
    setEditing(null);
    onRefresh();
  };

  const deleteCommitment = async (id: string) => {
    if (!confirm("Delete this expense permanently?")) return;
    await fetch(`/api/commitments?id=${id}`, { method: "DELETE" });
    onRefresh();
  };

  const addCommitment = async () => {
    const effectiveRule = newCmt.recurrence_rule === "custom" && customValue
      ? `every_${customValue}_${customUnit}`
      : newCmt.recurrence_rule;
    await fetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newCmt,
        recurrence_rule: effectiveRule,
        amount: parseFloat(newCmt.amount) || 0,
      }),
    });
    setAdding(false);
    setCustomValue("");
    setCustomUnit("days");
    setNewCmt({ name: "", type: "bill", amount: "", due_date: new Date().toISOString().slice(0, 10), recurrence_rule: "", priority: "normal", autopay: false, account_id: "" });
    onRefresh();
  };

  const sorted = [...commitments].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Bills &amp; Income</h2>
        <button onClick={() => setAdding(!adding)} className="text-sm font-medium text-sky-600 hover:text-sky-800 transition-colors">
          {adding ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={newCmt.name} onChange={(e) => setNewCmt({ ...newCmt, name: e.target.value })} placeholder="Expense name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
            <select value={newCmt.type} onChange={(e) => setNewCmt({ ...newCmt, type: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500">
              <option value="bill">Bill / Expense</option>
              <option value="income">Income</option>
            </select>
            <input type="number" value={newCmt.amount} onChange={(e) => setNewCmt({ ...newCmt, amount: e.target.value })} placeholder="Amount" step="0.01" className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input type="date" value={newCmt.due_date} onChange={(e) => setNewCmt({ ...newCmt, due_date: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
            <select value={newCmt.recurrence_rule} onChange={(e) => setNewCmt({ ...newCmt, recurrence_rule: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom (every N days)</option>
            </select>
            <select value={newCmt.priority} onChange={(e) => setNewCmt({ ...newCmt, priority: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500">
              <option value="critical">Critical</option>
              <option value="normal">Normal</option>
              <option value="flexible">Flexible</option>
            </select>
            <select value={newCmt.account_id} onChange={(e) => setNewCmt({ ...newCmt, account_id: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500">
              <option value="">No account</option>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
          {newCmt.recurrence_rule === "custom" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Every how many?</label>
              <div className="flex gap-2">
                <input type="number" value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="e.g., 6" min="1" step="1" className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
                <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as "days" | "weeks")} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500">
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
            </div>
          )}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={newCmt.autopay} onChange={(e) => setNewCmt({ ...newCmt, autopay: e.target.checked })} className="rounded border-slate-300" />
              Autopay
            </label>
            <button onClick={addCommitment} disabled={!newCmt.name || !newCmt.amount || (newCmt.recurrence_rule === "custom" && !customValue)} className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors">
              Add Expense
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recurrence</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Auto</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((cmt) =>
                editing === cmt.id ? (
                  <tr key={cmt.id} className="bg-amber-50/50">
                    <td className="px-4 py-2"><input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500" /></td>
                    <td className="px-4 py-2"><select value={form.type || "bill"} onChange={(e) => setForm({ ...form, type: e.target.value as "income" | "bill" })} className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"><option value="bill">Bill</option><option value="income">Income</option></select></td>
                    <td className="px-4 py-2"><input type="number" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) })} step="0.01" className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500" /></td>
                    <td className="px-4 py-2"><input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500" /></td>
                    <td className="px-4 py-2">
                      <select value={isCustomRule(form.recurrence_rule) ? "custom" : (form.recurrence_rule || "")} onChange={(e) => { const v = e.target.value; setForm({ ...form, recurrence_rule: v === "custom" ? "custom" : (v || null) }); if (v !== "custom") { setEditCustomValue(""); setEditCustomUnit("days"); } }} className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500">
                        <option value="">One-time</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option>
                      </select>
                      {(form.recurrence_rule === "custom" || isCustomRule(form.recurrence_rule)) && (
                        <div className="flex gap-1 mt-1">
                          <input type="number" value={editCustomValue} onChange={(e) => setEditCustomValue(e.target.value)} placeholder="#" min="1" step="1" className="w-16 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-sky-500" />
                          <select value={editCustomUnit} onChange={(e) => setEditCustomUnit(e.target.value as "days" | "weeks")} className="rounded border border-slate-300 px-1 py-1 text-xs outline-none focus:ring-2 focus:ring-sky-500">
                            <option value="days">days</option>
                            <option value="weeks">wks</option>
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2"><select value={form.priority || "normal"} onChange={(e) => setForm({ ...form, priority: e.target.value as Commitment["priority"] })} className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"><option value="critical">Critical</option><option value="normal">Normal</option><option value="flexible">Flexible</option></select></td>
                    <td className="px-4 py-2"><input type="checkbox" checked={!!form.autopay} onChange={(e) => setForm({ ...form, autopay: e.target.checked ? 1 : 0 })} className="rounded border-slate-300" /></td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={saveEdit} className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">Save</button>
                        <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={cmt.id} className={`hover:bg-slate-50/50 transition-colors ${cmt.paid ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${cmt.type === "income" ? "bg-emerald-500" : "bg-rose-400"}`} />
                        <span className="font-medium text-slate-800">{cmt.name}</span>
                        {cmt.paid === 1 && (<span className="text-[10px] font-medium bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">PAID</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">{cmt.type}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-800">{cmt.type === "income" ? "+" : "−"}${cmt.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-slate-600">{cmt.due_date}</td>
                    <td className="px-4 py-3 capitalize text-slate-500">{formatRecurrence(cmt.recurrence_rule)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cmt.priority === "critical" ? "bg-red-100 text-red-700" : cmt.priority === "flexible" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"}`}>{cmt.priority}</span>
                    </td>
                    <td className="px-4 py-3">{cmt.autopay ? (<span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">AUTO</span>) : (<span className="text-xs text-slate-400">—</span>)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(cmt)} className="px-3 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors">Edit</button>
                        <button onClick={() => deleteCommitment(cmt.id)} className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {commitments.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">No expenses yet. Add your first bill or income above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Danger Zone ─── */

function DangerZone({ onRefresh }: { onRefresh: () => void }) {
  const [confirmText, setConfirmText] = useState("");
  const [seedBalance, setSeedBalance] = useState("");
  const [showSeedPrompt, setShowSeedPrompt] = useState(false);

  const handleReset = async () => {
    if (confirmText !== "RESET") return;
    await fetch("/api/reset", { method: "POST" });
    setConfirmText("");
    onRefresh();
  };

  const handleSeed = async () => {
    const balance = parseFloat(seedBalance);
    if (isNaN(balance)) return;
    await fetch("/api/seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checking_balance: balance }),
    });
    setSeedBalance("");
    setShowSeedPrompt(false);
    onRefresh();
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-red-200 bg-red-50/50 p-6 space-y-4 mt-8">
      <h2 className="text-lg font-semibold text-red-800">Danger Zone</h2>
      <p className="text-sm text-red-700/70">These actions are destructive. Use them to start fresh with your real data.</p>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-red-800">Clear all data &amp; start fresh</p>
          <p className="text-xs text-red-600/70">Type <strong>RESET</strong> to confirm. This deletes all accounts, expenses, and alerts.</p>
          <div className="flex items-center gap-2">
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "RESET"' className="rounded-lg border border-red-300 px-3 py-2 text-sm w-36 outline-none focus:ring-2 focus:ring-red-500" />
            <button onClick={handleReset} disabled={confirmText !== "RESET"} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Clear Everything</button>
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-red-800">Load my default bills</p>
          <p className="text-xs text-red-600/70">Replaces everything with your real monthly bills and paycheck. You&apos;ll enter your current checking balance first.</p>
          {!showSeedPrompt ? (
            <button onClick={() => setShowSeedPrompt(true)} className="px-4 py-2 text-sm font-semibold text-red-700 border border-red-300 bg-white rounded-lg hover:bg-red-50 transition-colors">Load Default Month</button>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-red-800">Current checking balance ($)</label>
              <div className="flex items-center gap-2">
                <input type="number" value={seedBalance} onChange={(e) => setSeedBalance(e.target.value)} placeholder="e.g. 3200.00" step="0.01" autoFocus className="rounded-lg border border-red-300 px-3 py-2 text-sm w-40 outline-none focus:ring-2 focus:ring-red-500" />
                <button onClick={handleSeed} disabled={!seedBalance || isNaN(parseFloat(seedBalance))} className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Seed &amp; Go</button>
                <button onClick={() => { setShowSeedPrompt(false); setSeedBalance(""); }} className="px-3 py-2 text-sm text-red-600 hover:text-red-800 transition-colors">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Help Guide ─── */

function HelpGuide() {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-lg">
      <h2 className="text-xl font-bold">Welcome to Cash Clarity</h2>
      <p className="mt-1 text-sky-100 text-sm leading-relaxed max-w-2xl">
        This dashboard helps your family see exactly where your cash stands — not just today,
        but 28 days out. No guessing, no surprises. Check the Expenses tab to manage your
        bills and income, or visit the Dashboard for a full overview.
      </p>
    </div>
  );
}
