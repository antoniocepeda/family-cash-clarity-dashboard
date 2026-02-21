"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import { Account, CashEvent } from "@/lib/types";

type Tab = "accounts" | "events" | "help";

export default function ManagePage() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<CashEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [acctRes, evtRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch("/api/events"),
    ]);
    setAccounts(await acctRes.json());
    setEvents(await evtRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Nav />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Manage Your Data</h1>
          <span className="text-xs text-slate-400">
            {accounts.length} accounts &middot; {events.length} events
          </span>
        </div>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {(["accounts", "events", "help"] as Tab[]).map((t) => (
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
              {t === "help" ? "Help & Guide" : t}
            </button>
          ))}
        </div>

        {tab === "accounts" && (
          <AccountsManager accounts={accounts} onRefresh={fetchData} />
        )}
        {tab === "events" && (
          <EventsManager events={events} accounts={accounts} onRefresh={fetchData} />
        )}
        {tab === "help" && <HelpGuide />}

        {tab !== "help" && <DangerZone onRefresh={fetchData} />}
      </main>
    </div>
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
    if (!confirm("Delete this account? Events linked to it will lose their account reference."))
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
                    <input
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </td>
                  <td className="px-5 py-2">
                    <select
                      value={form.type || "checking"}
                      onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })}
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                      <option value="cash">Cash</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td className="px-5 py-2">
                    <input
                      type="number"
                      value={form.current_balance ?? 0}
                      onChange={(e) => setForm({ ...form, current_balance: parseFloat(e.target.value) })}
                      step="0.01"
                      className="w-28 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </td>
                  <td className="px-5 py-2">
                    <input
                      type="checkbox"
                      checked={!!form.is_reserve}
                      onChange={(e) => setForm({ ...form, is_reserve: e.target.checked ? 1 : 0 })}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-5 py-2 text-xs text-slate-400">—</td>
                  <td className="px-5 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={saveEdit}
                        className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={acct.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">{acct.name}</td>
                  <td className="px-5 py-3 capitalize text-slate-600">{acct.type}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800 tabular-nums">
                    ${acct.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-5 py-3">
                    {acct.is_reserve ? (
                      <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Reserve</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {new Date(acct.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => startEdit(acct)}
                        className="px-3 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteAccount(acct.id)}
                        className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                  No accounts yet. Add your first account above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Events Manager ─── */

function EventsManager({
  events,
  accounts,
  onRefresh,
}: {
  events: CashEvent[];
  accounts: Account[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CashEvent>>({});
  const [adding, setAdding] = useState(false);
  const [newEvt, setNewEvt] = useState({
    name: "",
    type: "bill" as string,
    amount: "",
    due_date: new Date().toISOString().slice(0, 10),
    recurrence_rule: "",
    priority: "normal",
    autopay: false,
    account_id: "",
  });

  const startEdit = (evt: CashEvent) => {
    setEditing(evt.id);
    setForm({ ...evt });
  };

  const saveEdit = async () => {
    if (!form.id) return;
    await fetch("/api/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setEditing(null);
    onRefresh();
  };

  const deleteEvent = async (id: string) => {
    if (!confirm("Delete this event permanently?")) return;
    await fetch(`/api/events?id=${id}`, { method: "DELETE" });
    onRefresh();
  };

  const addEvent = async () => {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newEvt,
        amount: parseFloat(newEvt.amount) || 0,
      }),
    });
    setAdding(false);
    setNewEvt({
      name: "",
      type: "bill",
      amount: "",
      due_date: new Date().toISOString().slice(0, 10),
      recurrence_rule: "",
      priority: "normal",
      autopay: false,
      account_id: "",
    });
    onRefresh();
  };

  const sortedEvents = [...events].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Bills &amp; Income Events</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="text-sm font-medium text-sky-600 hover:text-sky-800 transition-colors"
        >
          {adding ? "Cancel" : "+ Add Event"}
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              value={newEvt.name}
              onChange={(e) => setNewEvt({ ...newEvt, name: e.target.value })}
              placeholder="Event name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
            <select
              value={newEvt.type}
              onChange={(e) => setNewEvt({ ...newEvt, type: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="bill">Bill / Expense</option>
              <option value="income">Income</option>
            </select>
            <input
              type="number"
              value={newEvt.amount}
              onChange={(e) => setNewEvt({ ...newEvt, amount: e.target.value })}
              placeholder="Amount"
              step="0.01"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              type="date"
              value={newEvt.due_date}
              onChange={(e) => setNewEvt({ ...newEvt, due_date: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            />
            <select
              value={newEvt.recurrence_rule}
              onChange={(e) => setNewEvt({ ...newEvt, recurrence_rule: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
            <select
              value={newEvt.priority}
              onChange={(e) => setNewEvt({ ...newEvt, priority: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="critical">Critical</option>
              <option value="normal">Normal</option>
              <option value="flexible">Flexible</option>
            </select>
            <select
              value={newEvt.account_id}
              onChange={(e) => setNewEvt({ ...newEvt, account_id: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="">No account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={newEvt.autopay}
                onChange={(e) => setNewEvt({ ...newEvt, autopay: e.target.checked })}
                className="rounded border-slate-300"
              />
              Autopay
            </label>
            <button
              onClick={addEvent}
              disabled={!newEvt.name || !newEvt.amount}
              className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-lg hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              Add Event
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
              {sortedEvents.map((evt) =>
                editing === evt.id ? (
                  <tr key={evt.id} className="bg-amber-50/50">
                    <td className="px-4 py-2">
                      <input
                        value={form.name || ""}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={form.type || "bill"}
                        onChange={(e) => setForm({ ...form, type: e.target.value as "income" | "bill" })}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="bill">Bill</option>
                        <option value="income">Income</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        value={form.amount ?? 0}
                        onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) })}
                        step="0.01"
                        className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="date"
                        value={form.due_date || ""}
                        onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={form.recurrence_rule || ""}
                        onChange={(e) => setForm({ ...form, recurrence_rule: e.target.value || null })}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="">One-time</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Biweekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={form.priority || "normal"}
                        onChange={(e) => setForm({ ...form, priority: e.target.value as CashEvent["priority"] })}
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-500"
                      >
                        <option value="critical">Critical</option>
                        <option value="normal">Normal</option>
                        <option value="flexible">Flexible</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={!!form.autopay}
                        onChange={(e) => setForm({ ...form, autopay: e.target.checked ? 1 : 0 })}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-3 py-1 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={evt.id} className={`hover:bg-slate-50/50 transition-colors ${evt.paid ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${evt.type === "income" ? "bg-emerald-500" : "bg-rose-400"}`} />
                        <span className="font-medium text-slate-800">{evt.name}</span>
                        {evt.paid === 1 && (
                          <span className="text-[10px] font-medium bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">PAID</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">{evt.type}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-800">
                      {evt.type === "income" ? "+" : "−"}${evt.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{evt.due_date}</td>
                    <td className="px-4 py-3 capitalize text-slate-500">{evt.recurrence_rule || "One-time"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        evt.priority === "critical"
                          ? "bg-red-100 text-red-700"
                          : evt.priority === "flexible"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {evt.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {evt.autopay ? (
                        <span className="text-[10px] font-medium bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">AUTO</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(evt)}
                          className="px-3 py-1 text-xs font-medium text-sky-600 bg-sky-50 rounded-lg hover:bg-sky-100 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteEvent(evt.id)}
                          className="px-3 py-1 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {events.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-400">
                    No events yet. Add your first bill or income above.
                  </td>
                </tr>
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
      <p className="text-sm text-red-700/70">
        These actions are destructive. Use them to start fresh with your real data.
      </p>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-red-800">Clear all data &amp; start fresh</p>
          <p className="text-xs text-red-600/70">
            Type <strong>RESET</strong> to confirm. This deletes all accounts, events, and alerts.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type "RESET"'
              className="rounded-lg border border-red-300 px-3 py-2 text-sm w-36 outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              onClick={handleReset}
              disabled={confirmText !== "RESET"}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Clear Everything
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <p className="text-sm font-medium text-red-800">Load my default bills</p>
          <p className="text-xs text-red-600/70">
            Replaces everything with your real monthly bills and paycheck. You&apos;ll enter your current checking balance first.
          </p>
          {!showSeedPrompt ? (
            <button
              onClick={() => setShowSeedPrompt(true)}
              className="px-4 py-2 text-sm font-semibold text-red-700 border border-red-300 bg-white rounded-lg hover:bg-red-50 transition-colors"
            >
              Load Default Month
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-red-800">
                Current checking balance ($)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={seedBalance}
                  onChange={(e) => setSeedBalance(e.target.value)}
                  placeholder="e.g. 3200.00"
                  step="0.01"
                  autoFocus
                  className="rounded-lg border border-red-300 px-3 py-2 text-sm w-40 outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={handleSeed}
                  disabled={!seedBalance || isNaN(parseFloat(seedBalance))}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Seed &amp; Go
                </button>
                <button
                  onClick={() => { setShowSeedPrompt(false); setSeedBalance(""); }}
                  className="px-3 py-2 text-sm text-red-600 hover:text-red-800 transition-colors"
                >
                  Cancel
                </button>
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
  const [open, setOpen] = useState<string | null>("getting-started");

  const toggle = (id: string) => setOpen(open === id ? null : id);

  return (
    <div className="space-y-6">
      {/* Quick Start Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-lg">
        <h2 className="text-xl font-bold">Welcome to Cash Clarity</h2>
        <p className="mt-1 text-sky-100 text-sm leading-relaxed max-w-2xl">
          This dashboard helps your family see exactly where your cash stands — not just today,
          but 28 days out. No guessing, no surprises. Below is everything you need to get started
          and use it effectively.
        </p>
      </div>

      {/* Accordion Sections */}
      <div className="space-y-3">
        <AccordionSection
          id="getting-started"
          title="Getting Started"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-slate-800 mb-1">First Launch</h4>
              <p className="text-sm text-slate-600">
                The app auto-loads demo data so you can explore. When you&apos;re ready to enter real data,
                go to the <strong>Danger Zone</strong> below on this page, type RESET, and clear everything.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 mb-1">Setting Up Your Real Data</h4>
              <ol className="text-sm text-slate-600 list-decimal list-inside space-y-1.5">
                <li>Clear demo data using the Danger Zone</li>
                <li>Switch to the <strong>Accounts</strong> tab — add each bank account, cash stash, or savings account with its current balance</li>
                <li>Mark emergency/savings accounts as <strong>Reserve</strong> so they&apos;re excluded from your spending number</li>
                <li>Switch to the <strong>Events</strong> tab — add every recurring bill and income source</li>
                <li>Add any known one-time expenses (dentist, car repair, registration, etc.)</li>
                <li>Go to <strong>Dashboard</strong> — everything updates automatically</li>
              </ol>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="cash-position"
          title="Cash Position (The Three Cards)"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />}
          open={open}
          toggle={toggle}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4 font-semibold text-slate-700">Card</th>
                  <th className="text-left py-2 font-semibold text-slate-700">What It Means</th>
                </tr>
              </thead>
              <tbody className="text-slate-600">
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 pr-4 font-medium text-emerald-700 whitespace-nowrap">Cash On-Hand</td>
                  <td className="py-2.5">Total across all non-reserve accounts (checking, cash). Money you can actually touch.</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2.5 pr-4 font-medium text-amber-700 whitespace-nowrap">Reserved</td>
                  <td className="py-2.5">Total in accounts marked &ldquo;reserve&rdquo; (emergency savings). Excluded from spending calculations.</td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-sky-700 whitespace-nowrap">True Available</td>
                  <td className="py-2.5">What you actually have to work with right now.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </AccordionSection>

        <AccordionSection
          id="priorities"
          title="Priority Levels"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />}
          open={open}
          toggle={toggle}
        >
          <p className="text-sm text-slate-600 mb-3">Use these consistently so alerts stay useful:</p>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg bg-red-50 p-3">
              <span className="shrink-0 mt-0.5 text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Critical</span>
              <div>
                <p className="text-sm text-slate-700">Missing this causes real damage — late fees, shutoffs, credit hits.</p>
                <p className="text-xs text-slate-500 mt-0.5">Examples: Rent, electric, car insurance, minimum debt payments, paychecks</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
              <span className="shrink-0 mt-0.5 text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">Normal</span>
              <div>
                <p className="text-sm text-slate-700">Important but a day or two delay won&apos;t cause harm.</p>
                <p className="text-xs text-slate-500 mt-0.5">Examples: Phone, internet, groceries, gas</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
              <span className="shrink-0 mt-0.5 text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Flexible</span>
              <div>
                <p className="text-sm text-slate-700">Can be deferred or cancelled if cash is tight.</p>
                <p className="text-xs text-slate-500 mt-0.5">Examples: Streaming, gym, dining out, subscriptions</p>
              </div>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="projection"
          title="Reading the Projection Chart"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center gap-3">
              <span className="h-1 w-8 rounded bg-sky-500" />
              <span><strong>Blue line</strong> — your projected balance over 28 days</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-0 w-8 border-t-2 border-dashed border-red-500" />
              <span><strong>Red dashed</strong> — the $0 danger line. If the blue line crosses this, you&apos;ll go negative.</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-0 w-8 border-t-2 border-dashed border-amber-500" />
              <span><strong>Amber dashed</strong> — the $500 buffer threshold. Dropping below triggers a warning.</span>
            </div>
            <p className="text-slate-500 mt-2">
              <strong>Hover</strong> over any point to see the exact balance and which events hit that day.
              Drops = bills going out. Jumps up = income coming in.
            </p>
          </div>
        </AccordionSection>

        <AccordionSection
          id="alerts"
          title="Understanding Alerts"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />}
          open={open}
          toggle={toggle}
        >
          <p className="text-sm text-slate-600 mb-3">
            Alerts only appear when something needs attention. Each includes a suggested action.
          </p>
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-red-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-700 uppercase">Critical</p>
                <ul className="text-sm text-slate-600 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Balance projected to go negative within 14 days</li>
                  <li>Bill due within 48 hours (not on autopay)</li>
                  <li>Overdue critical bill</li>
                </ul>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase">Warning</p>
                <ul className="text-sm text-slate-600 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Balance drops below $500 buffer</li>
                  <li>Large irregular expense coming within 7 days</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              If you see <strong>&ldquo;All clear&rdquo;</strong> in green — no action needed.
            </p>
          </div>
        </AccordionSection>

        <AccordionSection
          id="mark-paid"
          title="Marking Events as Paid"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>On the Dashboard, each event row has a <strong>Mark Paid</strong> button. Here&apos;s what happens:</p>
            <div className="space-y-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-700">One-time events</p>
                <p className="text-slate-500 mt-0.5">Marked as paid and grayed out. They won&apos;t appear in projections.</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-700">Recurring events</p>
                <p className="text-slate-500 mt-0.5">Due date advances to the next occurrence automatically (e.g., monthly bill due Feb 23 → Mar 23).</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="font-medium text-slate-700">Account balance</p>
                <p className="text-slate-500 mt-0.5">If linked to an account, the balance adjusts — bills subtract, income adds.</p>
              </div>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="reconcile"
          title="Syncing with Your Bank"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <p>Your projected balance will drift from reality. Sync with your bank to correct it:</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Open your bank app and note the actual balance</li>
              <li>Click <strong>Sync with Bank</strong> on the Dashboard (or edit the account here)</li>
              <li>Select the account and enter the real number</li>
              <li>All projections recalculate instantly</li>
            </ol>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mt-2">
              <p className="text-amber-800 text-sm">
                <strong>Tip:</strong> Do this every 2–3 days. If data feels stale, you&apos;ll stop checking — and that defeats the whole purpose.
              </p>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="workflows"
          title="Recommended Workflows"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-4">
            <WorkflowBlock
              title="Morning Check"
              time="2–5 min"
              color="emerald"
              steps={[
                "Glance at Cash On-Hand and True Available",
                "Check for red or amber alerts — follow suggested actions",
                "Scan the Next 7 Days sidebar",
                "Done. You know your cash status.",
              ]}
            />
            <WorkflowBlock
              title="Weekly Planning"
              time="15–20 min"
              color="sky"
              steps={[
                "Check the 28-Day Projection for dips below buffer or $0",
                "Review Upcoming Events for the next 14 days",
                "Add or adjust irregular expenses",
                "If a dangerous low point shows, decide: move money or defer a flexible bill",
                "Sync your main account with your bank",
              ]}
            />
            <WorkflowBlock
              title="Payday"
              time="20–30 min"
              color="violet"
              steps={[
                "Confirm paycheck cleared — Sync the account with your bank",
                "Review Next 7 Days — fund critical bills first",
                "Check the projection chart with new income factored in",
                "Decide your discretionary spending cap until next payday",
              ]}
            />
            <WorkflowBlock
              title="Monthly Review"
              time="30–45 min"
              color="amber"
              steps={[
                "Go to Manage > Events — review all active events",
                "Update changed amounts (new rates, price increases)",
                "Delete cancelled services, add new ones",
                "Look for one fixed cost to reduce",
                "Sync all accounts with your bank",
              ]}
            />
          </div>
        </AccordionSection>

        <AccordionSection
          id="tips"
          title="Tips & Best Practices"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium text-slate-700">Autopay dates vs. due dates</p>
              <p className="mt-0.5 text-slate-500">
                Autopay often pulls before the due date. Enter when money actually moves, not when the statement says it&apos;s due.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium text-slate-700">Don&apos;t forget annual/quarterly bills</p>
              <p className="mt-0.5 text-slate-500">
                Car registration, insurance premiums, annual subscriptions — these &ldquo;nuke confidence&rdquo; when they surprise you. Add them with the right recurrence.
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium text-slate-700">When cash gets tight</p>
              <ol className="mt-1 text-slate-500 list-decimal list-inside space-y-0.5">
                <li>Find the lowest point on the projection chart</li>
                <li>Check which events hit right before it</li>
                <li>Which are flexible and can be deferred?</li>
                <li>Can you move money from reserves temporarily?</li>
                <li>Can you accelerate any expected income?</li>
              </ol>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="font-medium text-slate-700">Keep data fresh</p>
              <p className="mt-0.5 text-slate-500">
                Sync with your bank every 2–3 days. Confirm bills when you pay them. Delete events that no longer apply. Stale data = abandoned app.
              </p>
            </div>
          </div>
        </AccordionSection>

        <AccordionSection
          id="api"
          title="API Reference (Advanced)"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              All data lives in a local SQLite database. You can also interact via the API for bulk imports or scripting:
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Endpoint</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Method</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>
                  </tr>
                </thead>
                <tbody className="text-slate-600 divide-y divide-slate-100 font-mono">
                  {[
                    ["/api/accounts", "GET", "List all accounts"],
                    ["/api/accounts", "POST", "Create account"],
                    ["/api/accounts", "PUT", "Update account"],
                    ["/api/accounts?id=xxx", "DELETE", "Delete account"],
                    ["/api/accounts/sync", "POST", "Sync account with bank balance"],
                    ["/api/events", "GET", "List active events"],
                    ["/api/events", "POST", "Create event"],
                    ["/api/events", "PUT", "Update event"],
                    ["/api/events?id=xxx", "DELETE", "Delete event"],
                    ["/api/events/mark-paid", "POST", "Confirm event paid with actual amount"],
                    ["/api/projections?days=28", "GET", "Get daily projections"],
                    ["/api/alerts", "GET", "Get current alerts"],
                    ["/api/seed", "POST", "Seed default month (pass checking_balance)"],
                    ["/api/reset", "POST", "Delete all data"],
                  ].map(([endpoint, method, desc], i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-sky-700">{endpoint}</td>
                      <td className="px-3 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          method === "GET" ? "bg-emerald-100 text-emerald-700" :
                          method === "POST" ? "bg-sky-100 text-sky-700" :
                          method === "PUT" ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        }`}>{method}</span>
                      </td>
                      <td className="px-3 py-1.5 font-sans">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Recurrence values: <code className="bg-slate-100 px-1 rounded">weekly</code>,{" "}
              <code className="bg-slate-100 px-1 rounded">biweekly</code>,{" "}
              <code className="bg-slate-100 px-1 rounded">monthly</code>,{" "}
              <code className="bg-slate-100 px-1 rounded">quarterly</code>,{" "}
              <code className="bg-slate-100 px-1 rounded">annual</code>, or omit for one-time.
            </p>
          </div>
        </AccordionSection>

        <AccordionSection
          id="troubleshooting"
          title="Troubleshooting"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />}
          open={open}
          toggle={toggle}
        >
          <div className="space-y-3 text-sm text-slate-600">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-700">Dashboard shows &ldquo;Loading...&rdquo; forever</p>
              <p className="mt-0.5 text-slate-500">The dev server may not be running. Open a terminal in the <code className="bg-slate-100 px-1 rounded">app/</code> directory and run <code className="bg-slate-100 px-1 rounded">npm run dev</code>.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-700">Data looks stale or wrong</p>
              <p className="mt-0.5 text-slate-500">Sync your account balances with your bank. If truly corrupted, use Danger Zone → Clear Everything and re-enter.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-700">Projection chart looks flat</p>
              <p className="mt-0.5 text-slate-500">You likely have no active events. Go to Events tab and add your bills and income.</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="font-medium text-slate-700">Alerts aren&apos;t showing</p>
              <p className="mt-0.5 text-slate-500">Alerts only appear for critical/warning conditions. If your balances are healthy and no bills are due soon, &ldquo;All clear&rdquo; is correct.</p>
            </div>
          </div>
        </AccordionSection>
      </div>
    </div>
  );
}

function AccordionSection({
  id,
  title,
  icon,
  open,
  toggle,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  open: string | null;
  toggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = open === id;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 shrink-0">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {icon}
          </svg>
        </div>
        <span className="flex-1 font-semibold text-slate-800">{title}</span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

function WorkflowBlock({
  title,
  time,
  color,
  steps,
}: {
  title: string;
  time: string;
  color: string;
  steps: string[];
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    sky: "bg-sky-50 border-sky-200 text-sky-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
  };
  const badgeMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.sky}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold">{title}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeMap[color] || badgeMap.sky}`}>
          {time}
        </span>
      </div>
      <ol className="text-sm list-decimal list-inside space-y-1 opacity-80">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
