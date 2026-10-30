"use client";

import { useEffect, useState, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import Nav from "@/components/Nav";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import { Account, Commitment, PlaidStatus } from "@/lib/types";

type Tab = "accounts" | "commitments" | "help";

export default function ManagePage() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [plaidStatus, setPlaidStatus] = useState<PlaidStatus>({ items: [], accounts: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [acctRes, cmtRes, plaidRes] = await Promise.all([
      authFetch("/api/accounts"),
      authFetch("/api/commitments"),
      authFetch("/api/plaid/sync"),
    ]);
    setAccounts(await readJsonArray<Account>(acctRes, "Accounts fetch"));
    setCommitments(await readJsonArray<Commitment>(cmtRes, "Commitments fetch"));
    setPlaidStatus(await plaidRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="flex-1 flex items-center justify-center">
          <div className="spinner" role="status" aria-label="Loading" />
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />

      <main className="page-shell">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Household</p>
            <h1 className="text-3xl font-medium text-[var(--text)]">Accounts</h1>
          </div>
          <span className="pb-1 text-xs text-[var(--muted)]">
            {accounts.length} accounts · {commitments.length} expenses
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1 rounded-full bg-[var(--surface-2)] p-1">
          {(["accounts", "commitments", "help"] as Tab[]).map((t) => {
            const label = t === "commitments" ? "expenses" : t;
            return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-h-11 rounded-full px-2 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-[var(--text)] text-[var(--ink)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              } ${t === "help" ? "flex items-center justify-center gap-1.5" : "capitalize"}`}
            >
              {t === "help" ? "Guide" : label}
            </button>
            );
          })}
        </div>

        {tab === "accounts" && (
          <AccountsManager accounts={accounts} plaidStatus={plaidStatus} onRefresh={fetchData} />
        )}
        {tab === "commitments" && (
          <CommitmentsManager commitments={commitments} accounts={accounts} onRefresh={fetchData} />
        )}
        {tab === "help" && <HelpGuide onRefresh={fetchData} />}
      </main>
    </>
  );
}

/* ─── Accounts Manager ─── */

function AccountsManager({
  accounts,
  plaidStatus,
  onRefresh,
}: {
  accounts: Account[];
  plaidStatus: PlaidStatus;
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
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [plaidMessage, setPlaidMessage] = useState<string | null>(null);
  const [plaidError, setPlaidError] = useState<string | null>(null);
  const [plaidBusy, setPlaidBusy] = useState(false);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      setPlaidBusy(true);
      setPlaidError(null);
      setPlaidMessage("Connecting bank...");
      try {
        const exchange = await authFetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_token, metadata }),
        });
        if (!exchange.ok) throw new Error((await exchange.json()).error || "Bank connection failed");

        const sync = await authFetch("/api/plaid/sync", { method: "POST" });
        if (!sync.ok && sync.status !== 207) throw new Error((await sync.json()).error || "Bank sync failed");
        setPlaidMessage("Bank connected. Accounts and transactions were synced.");
        setLinkToken(null);
        onRefresh();
      } catch (err) {
        setPlaidError(err instanceof Error ? err.message : "Bank connection failed");
      } finally {
        setPlaidBusy(false);
      }
    },
    onExit: (err) => {
      if (err) {
        setPlaidError(err.display_message || err.error_message || "Plaid Link was closed before completing.");
      }
      setLinkToken(null);
      setPlaidBusy(false);
    },
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, open, ready]);

  const startEdit = (acct: Account) => {
    setEditing(acct.id);
    setForm({ ...acct });
  };

  const saveEdit = async () => {
    if (!form.id) return;
    await authFetch("/api/accounts", {
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
    await authFetch(`/api/accounts?id=${id}`, { method: "DELETE" });
    onRefresh();
  };

  const addAccount = async () => {
    await authFetch("/api/accounts", {
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

  const connectBank = async () => {
    setPlaidBusy(true);
    setPlaidError(null);
    setPlaidMessage(null);
    try {
      const res = await authFetch("/api/plaid/link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start Plaid Link");
      setLinkToken(data.link_token);
    } catch (err) {
      setPlaidError(err instanceof Error ? err.message : "Could not start Plaid Link");
      setPlaidBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-[var(--text)]">Accounts</h2>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <button
            onClick={connectBank}
            disabled={plaidBusy}
            className="btn btn-primary"
          >
            Connect Bank
          </button>
          <button
            onClick={() => setAdding(!adding)}
            className="btn btn-ghost"
          >
            {adding ? "Cancel" : "Add account"}
          </button>
        </div>
      </div>

      {(plaidMessage || plaidError || plaidStatus.items.length > 0) && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Linked banks</h3>
              <p className="text-xs text-[var(--muted)]">{plaidStatus.items.length} institutions &middot; {plaidStatus.accounts.length} linked accounts</p>
            </div>
            {plaidBusy && <span className="text-xs font-medium text-[var(--muted)]">Working...</span>}
          </div>
          {plaidMessage && <p className="text-sm text-[var(--positive)] bg-[var(--positive-soft)] border border-[var(--line)] rounded-lg px-3 py-2">{plaidMessage}</p>}
          {plaidError && <p className="text-sm text-[var(--negative)] bg-[var(--negative-soft)] border border-[var(--line)] rounded-lg px-3 py-2">{plaidError}</p>}
          {plaidStatus.items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {plaidStatus.items.map((item) => (
                <div key={item.item_id} className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text)]">{item.institution_name || "Linked institution"}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.status === "connected" ? "bg-[var(--positive-soft)] text-[var(--positive)]" : "bg-[var(--negative-soft)] text-[var(--negative)]"}`}>{item.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.last_synced_at ? `Last synced ${new Date(item.last_synced_at).toLocaleString()}` : "Not synced yet"}
                  </p>
                  {item.error_message && <p className="mt-1 text-xs text-[var(--negative)]">{item.error_message}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {adding && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              value={newAcct.name}
              onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })}
              placeholder="Account name"
              className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none"
            />
            <select
              value={newAcct.type}
              onChange={(e) => setNewAcct({ ...newAcct, type: e.target.value })}
              className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none"
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
              className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={newAcct.is_reserve}
                  onChange={(e) => setNewAcct({ ...newAcct, is_reserve: e.target.checked })}
                  className="rounded border-[var(--line-strong)]"
                />
                Reserve
              </label>
              <button
                onClick={addAccount}
                disabled={!newAcct.name}
                className="px-4 py-2 text-sm font-semibold text-[var(--ink)] bg-[var(--text)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
        <table className="data-list w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Name</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Type</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Balance</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Reserve</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Updated</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {accounts.map((acct) =>
              editing === acct.id ? (
                <tr key={acct.id} className="bg-[var(--warning-soft)]">
                  <td className="px-5 py-2">
                    <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  </td>
                  <td className="px-5 py-2">
                    <select value={form.type || "checking"} onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })} className="rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]">
                      <option value="checking">Checking</option>
                      <option value="savings">Savings</option>
                      <option value="cash">Cash</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td className="px-5 py-2">
                    <input type="number" value={form.current_balance ?? 0} onChange={(e) => setForm({ ...form, current_balance: parseFloat(e.target.value) })} step="0.01" className="w-28 rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                  </td>
                  <td className="px-5 py-2">
                    <input type="checkbox" checked={!!form.is_reserve} onChange={(e) => setForm({ ...form, is_reserve: e.target.checked ? 1 : 0 })} className="rounded border-[var(--line-strong)]" />
                  </td>
                  <td className="px-5 py-2 text-xs text-[var(--muted)]">—</td>
                  <td className="px-5 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={saveEdit} className="px-3 py-1 text-xs font-semibold text-[var(--ink)] bg-[var(--text)] rounded-lg hover:opacity-90 transition-colors">Save</button>
                      <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={acct.id} className="hover:bg-[var(--surface-3)] transition-colors">
                  <td className="px-5 py-3 font-medium text-[var(--text)]" data-label="">{acct.name}</td>
                  <td className="px-5 py-3 capitalize text-[var(--text-secondary)]" data-label="Type">{acct.type}</td>
                  <td className="px-5 py-3 font-semibold text-[var(--text)] tabular-nums" data-label="Balance">${acct.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3" data-label="Reserve">
                    {acct.is_reserve ? (
                      <span className="text-xs font-medium bg-[var(--warning-soft)] text-[var(--warning)] px-2 py-0.5 rounded-full">Reserve</span>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-[var(--muted)]" data-label="Updated">{new Date(acct.updated_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3 text-right" data-label="">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => startEdit(acct)} className="px-3 py-1 text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] rounded-lg hover:bg-[var(--accent-soft)] transition-colors">Edit</button>
                      <button onClick={() => deleteAccount(acct.id)} className="px-3 py-1 text-xs font-medium text-[var(--negative)] bg-[var(--negative-soft)] rounded-lg hover:bg-[var(--negative-soft)] transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              )
            )}
            {accounts.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">No accounts yet. Add your first account above.</td></tr>
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
    recurrence_end_date: "",
    recurrence_count: "",
    account_id: "",
  });

  const isCustomRule = (rule: string | null | undefined) =>
    rule?.startsWith("every_") && (rule?.endsWith("_days") || rule?.endsWith("_weeks"));

  const parseCustom = (rule: string): { value: string; unit: "days" | "weeks" } => {
    if (rule.endsWith("_weeks")) return { value: rule.slice(6, -6), unit: "weeks" };
    return { value: rule.slice(6, -5), unit: "days" };
  };

  const formatRecurrence = (rule: string | null, endDate?: string | null, count?: number | null) => {
    const base = !rule
      ? "One-time"
      : isCustomRule(rule)
        ? `Every ${parseCustom(rule).value} ${parseCustom(rule).unit}`
        : rule;
    if (endDate) return `${base} until ${endDate}`;
    if (count) return `${base} × ${count}`;
    return base;
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
    await authFetch("/api/commitments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, recurrence_rule: effectiveRule }),
    });
    setEditing(null);
    onRefresh();
  };

  const deleteCommitment = async (id: string) => {
    if (!confirm("Delete this expense permanently?")) return;
    await authFetch(`/api/commitments?id=${id}`, { method: "DELETE" });
    onRefresh();
  };

  const addCommitment = async () => {
    const effectiveRule = newCmt.recurrence_rule === "custom" && customValue
      ? `every_${customValue}_${customUnit}`
      : newCmt.recurrence_rule;
    await authFetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newCmt,
        recurrence_rule: effectiveRule,
        recurrence_end_date: newCmt.recurrence_end_date || null,
        recurrence_count: newCmt.recurrence_count ? Number(newCmt.recurrence_count) : null,
        amount: parseFloat(newCmt.amount) || 0,
      }),
    });
    setAdding(false);
    setCustomValue("");
    setCustomUnit("days");
    setNewCmt({ name: "", type: "bill", amount: "", due_date: new Date().toISOString().slice(0, 10), recurrence_rule: "", recurrence_end_date: "", recurrence_count: "", account_id: "" });
    onRefresh();
  };

  const sorted = [...commitments].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text)]">Bills &amp; Income</h2>
        <button onClick={() => setAdding(!adding)} className="text-sm font-medium text-[var(--accent)] hover:text-[var(--text)] transition-colors">
          {adding ? "Cancel" : "+ Add Expense"}
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={newCmt.name} onChange={(e) => setNewCmt({ ...newCmt, name: e.target.value })} placeholder="Expense name" className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            <select value={newCmt.type} onChange={(e) => setNewCmt({ ...newCmt, type: e.target.value })} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]">
              <option value="bill">Bill / Expense</option>
              <option value="income">Income</option>
            </select>
            <input type="number" value={newCmt.amount} onChange={(e) => setNewCmt({ ...newCmt, amount: e.target.value })} placeholder="Amount" step="0.01" className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="date" value={newCmt.due_date} onChange={(e) => setNewCmt({ ...newCmt, due_date: e.target.value })} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            <select value={newCmt.recurrence_rule} onChange={(e) => setNewCmt({ ...newCmt, recurrence_rule: e.target.value })} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]">
              <option value="">One-time</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom (every N days)</option>
            </select>
            <select value={newCmt.account_id} onChange={(e) => setNewCmt({ ...newCmt, account_id: e.target.value })} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]">
              <option value="">No account</option>
              {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
            </select>
          </div>
          {newCmt.recurrence_rule && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                End date (optional)
                <input type="date" value={newCmt.recurrence_end_date} onChange={(e) => setNewCmt({ ...newCmt, recurrence_end_date: e.target.value })} className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </label>
              <label className="block text-xs font-medium text-[var(--text-secondary)]">
                Stop after this many (optional)
                <input type="number" min="1" step="1" value={newCmt.recurrence_count} onChange={(e) => setNewCmt({ ...newCmt, recurrence_count: e.target.value })} placeholder="Repeats until you stop it" className="mt-1 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              </label>
            </div>
          )}
          {newCmt.recurrence_rule === "custom" && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Every how many?</label>
              <div className="flex gap-2">
                <input type="number" value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="e.g., 6" min="1" step="1" className="w-24 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as "days" | "weeks")} className="rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]">
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <button onClick={addCommitment} disabled={!newCmt.name || !newCmt.amount || (newCmt.recurrence_rule === "custom" && !customValue)} className="px-4 py-2 text-sm font-semibold text-[var(--ink)] bg-[var(--text)] rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors">
              Add Expense
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-list w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Recurrence</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--muted)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {sorted.map((cmt) =>
                editing === cmt.id ? (
                  <tr key={cmt.id} className="bg-[var(--warning-soft)]">
                    <td className="px-4 py-2"><input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" /></td>
                    <td className="px-4 py-2"><select value={form.type || "bill"} onChange={(e) => setForm({ ...form, type: e.target.value as "income" | "bill" })} className="rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"><option value="bill">Bill</option><option value="income">Income</option></select></td>
                    <td className="px-4 py-2"><input type="number" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) })} step="0.01" className="w-24 rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" /></td>
                    <td className="px-4 py-2"><input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]" /></td>
                    <td className="px-4 py-2">
                      <select value={isCustomRule(form.recurrence_rule) ? "custom" : (form.recurrence_rule || "")} onChange={(e) => { const v = e.target.value; setForm({ ...form, recurrence_rule: v === "custom" ? "custom" : (v || null) }); if (v !== "custom") { setEditCustomValue(""); setEditCustomUnit("days"); } }} className="rounded border border-[var(--line-strong)] px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]">
                        <option value="">One-time</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option>
                      </select>
                      {form.recurrence_rule && (
                        <div className="mt-1 space-y-1">
                          <input type="date" aria-label="End date" value={form.recurrence_end_date || ""} onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value || null })} className="w-full rounded border border-[var(--line-strong)] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                          <input type="number" min="1" step="1" aria-label="Stop after this many" placeholder="No limit" value={form.recurrence_count ?? ""} onChange={(e) => setForm({ ...form, recurrence_count: e.target.value ? Number(e.target.value) : null })} className="w-full rounded border border-[var(--line-strong)] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                        </div>
                      )}
                      {(form.recurrence_rule === "custom" || isCustomRule(form.recurrence_rule)) && (
                        <div className="flex gap-1 mt-1">
                          <input type="number" value={editCustomValue} onChange={(e) => setEditCustomValue(e.target.value)} placeholder="#" min="1" step="1" className="w-16 rounded border border-[var(--line-strong)] px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                          <select value={editCustomUnit} onChange={(e) => setEditCustomUnit(e.target.value as "days" | "weeks")} className="rounded border border-[var(--line-strong)] px-1 py-1 text-xs outline-none focus:ring-2 focus:ring-[var(--accent)]">
                            <option value="days">days</option>
                            <option value="weeks">wks</option>
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={saveEdit} className="px-3 py-1 text-xs font-semibold text-[var(--ink)] bg-[var(--text)] rounded-lg hover:opacity-90 transition-colors">Save</button>
                        <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] transition-colors">Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={cmt.id} className={`hover:bg-[var(--surface-3)] transition-colors ${cmt.paid ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3" data-label="">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full shrink-0 ${cmt.type === "income" ? "bg-[var(--positive)]" : "bg-[var(--negative)]"}`} />
                        <span className="font-medium text-[var(--text)]">{cmt.name}</span>
                        {cmt.paid === 1 && (<span className="text-[10px] font-medium bg-[var(--surface-3)] text-[var(--muted)] px-1.5 py-0.5 rounded">PAID</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 capitalize text-[var(--text-secondary)]" data-label="Type">{cmt.type}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-[var(--text)]" data-label="Amount">{cmt.type === "income" ? "+" : "−"}${cmt.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]" data-label="Due">{cmt.due_date}</td>
                    <td className="px-4 py-3 capitalize text-[var(--muted)]" data-label="Repeats">{formatRecurrence(cmt.recurrence_rule, cmt.recurrence_end_date, cmt.recurrence_count)}</td>
                    <td className="px-4 py-3 text-right" data-label="">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(cmt)} className="px-3 py-1 text-xs font-medium text-[var(--accent)] bg-[var(--accent-soft)] rounded-lg hover:bg-[var(--accent-soft)] transition-colors">Edit</button>
                        <button onClick={() => deleteCommitment(cmt.id)} className="px-3 py-1 text-xs font-medium text-[var(--negative)] bg-[var(--negative-soft)] rounded-lg hover:bg-[var(--negative-soft)] transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {commitments.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-[var(--muted)]">No expenses yet. Add your first bill or income above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Reset Data ─── */

function ResetDataCard({ onRefresh }: { onRefresh: () => void }) {
  const [confirmText, setConfirmText] = useState("");

  const handleReset = async () => {
    if (confirmText !== "RESET") return;
    await authFetch("/api/reset", { method: "POST" });
    setConfirmText("");
    onRefresh();
  };

  return (
    <div className="rounded-2xl border-2 border-dashed border-[color-mix(in_srgb,var(--negative)_35%,transparent)] bg-[var(--negative-soft)] p-6 space-y-3">
      <h3 className="text-lg font-semibold text-[var(--negative)]">Reset Data</h3>
      <p className="text-sm text-[var(--negative)]">Type <strong>RESET</strong> to clear all accounts, expenses, and alerts.</p>
      <div className="flex items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder='Type "RESET"'
          className="rounded-lg border border-[color-mix(in_srgb,var(--negative)_45%,transparent)] px-3 py-2 text-sm w-36 outline-none focus:ring-2 focus:ring-[var(--negative)]"
        />
        <button
          onClick={handleReset}
          disabled={confirmText !== "RESET"}
          className="px-4 py-2 text-sm font-semibold text-[var(--negative)] bg-[var(--danger-fill)] rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Clear Everything
        </button>
      </div>
    </div>
  );
}

/* ─── Help Guide ─── */

function HelpGuide({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[var(--surface-3)] to-[var(--bg)] p-6 text-white shadow-lg">
        <h2 className="text-xl font-bold">Welcome to Cash Clarity</h2>
        <p className="mt-1 text-[var(--muted)] text-sm leading-relaxed max-w-2xl">
          This dashboard helps your family see exactly where your cash stands — not just today,
          but 28 days out. No guessing, no surprises. Check the Expenses tab to manage your
          bills and income, or visit the Dashboard for a full overview.
        </p>
      </div>
      <ResetDataCard onRefresh={onRefresh} />
    </div>
  );
}
