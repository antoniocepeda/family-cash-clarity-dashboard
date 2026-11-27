"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePlaidLink } from "react-plaid-link";
import LinkedBankCard from "@/components/LinkedBankCard";
import Nav from "@/components/Nav";
import ActivityRow from "@/components/ui/ActivityRow";
import RowMenu from "@/components/ui/RowMenu";
import StatusDot from "@/components/ui/StatusDot";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import { outsideBillsToMark, unpaidPastDueDate } from "@/lib/overdue";
import { Account, Commitment, CommitmentWithInstances, PlaidAccount, PlaidStatus } from "@/lib/types";

type LinkSession = { mode: "create" | "update"; itemId: string | null };
type SyncErrorBody = { error?: string; errors?: { item_id?: string; error?: string }[] };

type Tab = "accounts" | "commitments" | "help";

export default function ManagePage() {
  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [plaidStatus, setPlaidStatus] = useState<PlaidStatus>({ items: [], accounts: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [acctRes, cmtRes, plaidRes] = await Promise.all([
      authFetch("/api/accounts"),
      authFetch("/api/commitments"),
      authFetch("/api/plaid/sync"),
    ]);
    setAccounts(await readJsonArray<Account>(acctRes, "Accounts fetch"));
    setCommitments(await readJsonArray<CommitmentWithInstances>(cmtRes, "Commitments fetch"));
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
          <CommitmentsManager commitments={commitments} accounts={accounts} plaidAccounts={plaidStatus.accounts} onRefresh={fetchData} />
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
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const linkSessionRef = useRef<LinkSession>({ mode: "create", itemId: null });
  const linkCompletedRef = useRef(false);

  const finishLink = () => {
    linkSessionRef.current = { mode: "create", itemId: null };
    setPendingItemId(null);
    setLinkToken(null);
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: async (public_token, metadata) => {
      if (linkCompletedRef.current) return;
      const session = linkSessionRef.current;
      linkCompletedRef.current = true;
      setPlaidBusy(true);
      setPlaidError(null);
      setPlaidMessage(session.mode === "update" ? "Reconnecting bank..." : "Connecting bank...");
      try {
        if (session.mode === "update") {
          if (!session.itemId) throw new Error("Reconnect session was missing the bank");
          const sync = await authFetch(
            `/api/plaid/sync?item_id=${encodeURIComponent(session.itemId)}&reconnected=1`,
            { method: "POST" }
          );
          const body = (await sync.json().catch(() => ({}))) as SyncErrorBody;
          if (!sync.ok && sync.status !== 207) throw new Error(body.error || "Bank sync failed");
          const itemError =
            body.errors?.find((entry) => entry.item_id === session.itemId) ?? body.errors?.[0];
          if (itemError?.error) {
            setPlaidMessage(null);
            setPlaidError(itemError.error);
          } else {
            setPlaidMessage("Bank reconnected. Accounts and transactions were synced.");
          }
        } else {
          const exchange = await authFetch("/api/plaid/exchange-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_token, metadata }),
          });
          if (!exchange.ok) throw new Error((await exchange.json()).error || "Bank connection failed");

          const sync = await authFetch("/api/plaid/sync", { method: "POST" });
          if (!sync.ok && sync.status !== 207) throw new Error((await sync.json()).error || "Bank sync failed");
          setPlaidMessage("Bank connected. Accounts and transactions were synced.");
        }
        onRefresh();
      } catch (err) {
        setPlaidError(err instanceof Error ? err.message : "Bank connection failed");
      } finally {
        finishLink();
        setPlaidBusy(false);
      }
    },
    onExit: (err) => {
      if (linkCompletedRef.current) {
        setLinkToken(null);
        return;
      }
      if (err) {
        setPlaidError(err.display_message || err.error_message || "Plaid Link was closed before completing.");
      }
      finishLink();
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

  const startLink = async (session: LinkSession) => {
    setPlaidBusy(true);
    setPlaidError(null);
    setPlaidMessage(null);
    linkCompletedRef.current = false;
    linkSessionRef.current = session;
    setPendingItemId(session.itemId);
    try {
      const res = await authFetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session.itemId ? { item_id: session.itemId } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start Plaid Link");
      setLinkToken(data.link_token);
    } catch (err) {
      linkSessionRef.current = { mode: "create", itemId: null };
      setPendingItemId(null);
      setPlaidError(err instanceof Error ? err.message : "Could not start Plaid Link");
      setPlaidBusy(false);
    }
  };

  const connectBank = () => startLink({ mode: "create", itemId: null });
  const reconnectBank = (itemId: string) => startLink({ mode: "update", itemId });

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
            Connect bank
          </button>
          <button
            onClick={() => setAdding(!adding)}
            className="btn btn-secondary"
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
                <LinkedBankCard
                  key={item.item_id}
                  item={item}
                  busy={plaidBusy}
                  reconnecting={pendingItemId === item.item_id && plaidBusy}
                  onReconnect={reconnectBank}
                />
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
                className="btn btn-primary"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="surface overflow-hidden">
        {accounts.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">No accounts yet. Add your first account above.</p>
        )}
        <div className="activity-list">
          {accounts.map((acct) =>
            editing === acct.id ? (
              <div key={acct.id} className="space-y-3 border-t border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Account name" />
                  <select value={form.type || "checking"} onChange={(e) => setForm({ ...form, type: e.target.value as Account["type"] })} aria-label="Account type">
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="cash">Cash</option>
                    <option value="credit">Credit</option>
                  </select>
                  <input type="number" value={form.current_balance ?? 0} onChange={(e) => setForm({ ...form, current_balance: parseFloat(e.target.value) })} step="0.01" aria-label="Balance" />
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input type="checkbox" checked={!!form.is_reserve} onChange={(e) => setForm({ ...form, is_reserve: e.target.checked ? 1 : 0 })} />
                    Reserve
                  </label>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="btn btn-primary">Save</button>
                  <button onClick={() => setEditing(null)} className="btn btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              <ActivityRow
                key={acct.id}
                title={acct.name}
                amount={`$${acct.current_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                subtitle={
                  <>
                    <span className="capitalize">{acct.type}</span>
                    {acct.available_balance != null ? <span>· Posted</span> : null}
                    <span>· Updated {new Date(acct.updated_at).toLocaleDateString()}</span>
                    {acct.available_balance != null && (
                      <span>
                        · {acct.type === "credit" ? "Credit left" : "Available"} ${acct.available_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                    {acct.is_reserve ? <StatusDot tone="warning" label="Reserve" /> : null}
                  </>
                }
                trailing={
                  <RowMenu
                    label={`Actions for ${acct.name}`}
                    items={[
                      { label: "Edit", onSelect: () => startEdit(acct) },
                      { label: "Delete", tone: "danger", onSelect: () => deleteAccount(acct.id) },
                    ]}
                  />
                }
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Commitments Manager ─── */

function CommitmentsManager({
  commitments,
  accounts,
  plaidAccounts,
  onRefresh,
}: {
  commitments: CommitmentWithInstances[];
  accounts: Account[];
  plaidAccounts: PlaidAccount[];
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Commitment>>({});
  const [adding, setAdding] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"days" | "weeks">("days");
  const [editCustomValue, setEditCustomValue] = useState("");
  const [editCustomUnit, setEditCustomUnit] = useState<"days" | "weeks">("days");
  const [bankTagDraft, setBankTagDraft] = useState("");
  const [accountHintDraft, setAccountHintDraft] = useState("");
  const [markError, setMarkError] = useState<string | null>(null);
  const [newCmt, setNewCmt] = useState({
    name: "",
    type: "bill" as string,
    amount: "",
    due_date: new Date().toISOString().slice(0, 10),
    recurrence_rule: "",
    recurrence_end_date: "",
    recurrence_count: "",
    bank_statement_name: "",
    account_hint: "",
    account_id: "",
    paid_outside: false,
  });

  const maskFor = (accountId: string) => plaidAccounts.find((account) => account.app_account_id === accountId)?.mask;
  const accountLabel = (account: Account) => {
    const mask = maskFor(account.id);
    return mask ? `${account.name} ··${mask}` : account.name;
  };
  const hintLabel = (hint: string) => {
    const account = accounts.find((item) => item.id === hint);
    return account ? accountLabel(account) : hint;
  };

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
    setBankTagDraft((cmt.bank_match_tags ?? []).join(", "));
    setAccountHintDraft(cmt.account_hint ?? "");
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
      body: JSON.stringify({
        ...form,
        recurrence_rule: effectiveRule,
        bank_match_tags: bankTagDraft,
        account_hint: accountHintDraft,
        paid_outside: form.type === "income" ? false : Boolean(form.paid_outside),
      }),
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
        bank_match_tags: newCmt.bank_statement_name,
        account_hint: newCmt.account_hint,
        paid_outside: newCmt.paid_outside,
        amount: parseFloat(newCmt.amount) || 0,
      }),
    });
    setAdding(false);
    setCustomValue("");
    setCustomUnit("days");
    setNewCmt({ name: "", type: "bill", amount: "", due_date: new Date().toISOString().slice(0, 10), recurrence_rule: "", recurrence_end_date: "", recurrence_count: "", bank_statement_name: "", account_hint: "", account_id: "", paid_outside: false });
    onRefresh();
  };

  const markOutsidePaid = async (id: string, dueDate: string) => {
    setMarkError(null);
    try {
      const res = await authFetch("/api/commitments/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, instance_due_date: dueDate, paid_elsewhere: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMarkError(typeof body.error === "string" ? body.error : "Could not mark that bill paid");
        return;
      }
      onRefresh();
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : "Could not mark that bill paid");
    }
  };

  const sorted = [...commitments].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text)]">Bills &amp; Income</h2>
        <button onClick={() => setAdding(!adding)} className="btn btn-secondary">
          {adding ? "Cancel" : "Add expense"}
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
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Bank statement name
            <input
              value={newCmt.bank_statement_name}
              onChange={(e) => setNewCmt({ ...newCmt, bank_statement_name: e.target.value })}
              placeholder="Xfinity, COMCAST"
              aria-label="Bank statement name"
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
            <span className="mt-1 block font-normal text-[var(--muted)]">Optional. Comma-separated names as they appear on the bank statement.</span>
          </label>
          <label className="block text-xs font-medium text-[var(--text-secondary)]">
            Card or account
            <select
              value={newCmt.account_hint}
              onChange={(e) => setNewCmt({ ...newCmt, account_hint: e.target.value })}
              aria-label="Card or account"
              className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line-strong)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="">Any account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{accountLabel(account)}</option>
              ))}
            </select>
            <span className="mt-1 block font-normal text-[var(--muted)]">Optional. Tie this bill to one card when you have two of the same subscription.</span>
          </label>
          {newCmt.type === "bill" && (
            <label className="flex items-start gap-3 text-sm text-[var(--text)]">
              <input
                type="checkbox"
                checked={newCmt.paid_outside}
                onChange={(e) => setNewCmt({ ...newCmt, paid_outside: e.target.checked })}
                aria-label="Paid outside linked accounts"
                className="mt-1 rounded border-[var(--line-strong)]"
              />
              <span>
                <span className="font-medium">Paid outside linked accounts</span>
                <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                  Paid from an account that is not linked, such as T-Mobile or X Premium. No match questions and no overdue alert. Mark it paid once a month.
                </span>
              </span>
            </label>
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
            <button onClick={addCommitment} disabled={!newCmt.name || !newCmt.amount || (newCmt.recurrence_rule === "custom" && !customValue)} className="btn btn-primary">
              Add expense
            </button>
          </div>
        </div>
      )}

      {markError && <p className="text-sm text-[var(--negative)]">{markError}</p>}
      <div className="surface overflow-hidden">
        {commitments.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-[var(--muted)]">No expenses yet. Add your first bill or income above.</p>
        )}
        <div className="activity-list">
          {sorted.map((cmt) => {
            const today = new Date().toLocaleDateString("en-CA");
            const overdueDate = unpaidPastDueDate(cmt, today);
            const outsideDue = cmt.paid_outside ? outsideBillsToMark([cmt], today).slice(0, 6) : [];
            if (editing === cmt.id) {
              return (
                <div key={cmt.id} className="space-y-3 border-t border-[var(--line)] bg-[var(--surface-2)] p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Expense name" />
                    <select value={form.type || "bill"} onChange={(e) => setForm({ ...form, type: e.target.value as "income" | "bill" })} aria-label="Type">
                      <option value="bill">Bill</option>
                      <option value="income">Income</option>
                    </select>
                    <input type="number" value={form.amount ?? 0} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) })} step="0.01" aria-label="Amount" />
                    <input type="date" value={form.due_date || ""} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Due date" />
                    <select value={isCustomRule(form.recurrence_rule) ? "custom" : (form.recurrence_rule || "")} onChange={(e) => { const v = e.target.value; setForm({ ...form, recurrence_rule: v === "custom" ? "custom" : (v || null) }); if (v !== "custom") { setEditCustomValue(""); setEditCustomUnit("days"); } }} aria-label="Recurrence">
                      <option value="">One-time</option><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="custom">Custom</option>
                    </select>
                    {form.recurrence_rule && (
                      <>
                        <input type="date" aria-label="End date" value={form.recurrence_end_date || ""} onChange={(e) => setForm({ ...form, recurrence_end_date: e.target.value || null })} />
                        <input type="number" min="1" step="1" aria-label="Stop after this many" placeholder="No limit" value={form.recurrence_count ?? ""} onChange={(e) => setForm({ ...form, recurrence_count: e.target.value ? Number(e.target.value) : null })} />
                      </>
                    )}
                    {(form.recurrence_rule === "custom" || isCustomRule(form.recurrence_rule)) && (
                      <div className="flex gap-2">
                        <input type="number" value={editCustomValue} onChange={(e) => setEditCustomValue(e.target.value)} placeholder="#" min="1" step="1" aria-label="Custom interval" />
                        <select value={editCustomUnit} onChange={(e) => setEditCustomUnit(e.target.value as "days" | "weeks")} aria-label="Custom interval unit">
                          <option value="days">days</option>
                          <option value="weeks">wks</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    Bank statement name
                    <input
                      value={bankTagDraft}
                      onChange={(e) => setBankTagDraft(e.target.value)}
                      placeholder="Xfinity, COMCAST"
                      aria-label="Bank statement name"
                      className="mt-1 w-full"
                    />
                  </label>
                  <label className="block text-xs font-medium text-[var(--text-secondary)]">
                    Card or account
                    <select
                      value={accountHintDraft}
                      onChange={(e) => setAccountHintDraft(e.target.value)}
                      aria-label="Card or account"
                      className="mt-1 w-full"
                    >
                      <option value="">Any account</option>
                      {accountHintDraft && !accounts.some((account) => account.id === accountHintDraft) && (
                        <option value={accountHintDraft}>{accountHintDraft}</option>
                      )}
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>{accountLabel(account)}</option>
                      ))}
                    </select>
                  </label>
                  {form.type !== "income" && (
                    <label className="flex items-start gap-3 text-sm text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={Boolean(form.paid_outside)}
                        onChange={(e) => setForm({ ...form, paid_outside: e.target.checked })}
                        aria-label="Paid outside linked accounts"
                        className="mt-1 rounded border-[var(--line-strong)]"
                      />
                      <span>
                        <span className="font-medium">Paid outside linked accounts</span>
                        <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                          Paid from an account that is not linked, such as T-Mobile or X Premium. No match questions and no overdue alert. Mark it paid once a month on Home.
                        </span>
                      </span>
                    </label>
                  )}
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="btn btn-primary">Save</button>
                    <button onClick={() => setEditing(null)} className="btn btn-secondary">Cancel</button>
                  </div>
                </div>
              );
            }
            return (
              <ActivityRow
                key={cmt.id}
                title={cmt.name}
                tone={cmt.type === "income" ? "in" : overdueDate ? "overdue" : "neutral"}
                amount={`${cmt.type === "income" ? "+" : "−"}$${cmt.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                subtitle={
                  <>
                    <span className="capitalize">{cmt.type}</span>
                    <span className={overdueDate ? "is-overdue-text" : undefined}>· Due {overdueDate ?? cmt.due_date}</span>
                    <span>· {formatRecurrence(cmt.recurrence_rule, cmt.recurrence_end_date, cmt.recurrence_count)}</span>
                    {(cmt.bank_match_tags ?? []).length > 0 && <span>· Statement {cmt.bank_match_tags?.join(", ")}</span>}
                    {cmt.account_hint && <span>· Card {hintLabel(cmt.account_hint)}</span>}
                    {cmt.paid_outside && <span>· Paid outside linked accounts</span>}
                    {cmt.paid === 1 && <StatusDot tone="neutral" label="Paid" />}
                    {overdueDate && <StatusDot tone="negative" label="Overdue" />}
                  </>
                }
                trailing={
                  <RowMenu
                    label={`Actions for ${cmt.name}`}
                    items={[
                      { label: "Edit", onSelect: () => startEdit(cmt) },
                      ...outsideDue.map((item) => ({
                        label: `Mark paid ${item.dueDate}`,
                        onSelect: () => markOutsidePaid(cmt.id, item.dueDate),
                      })),
                      { label: "Delete", tone: "danger", onSelect: () => deleteCommitment(cmt.id) },
                    ]}
                  />
                }
              />
            );
          })}
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
    <div className="surface space-y-3 p-6">
      <div className="flex items-center gap-2">
        <StatusDot tone="negative" label="Reset data" />
      </div>
      <p className="text-sm text-[var(--muted)]">Type <strong>RESET</strong> to clear all accounts, expenses, and alerts.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type RESET"
          aria-label="Type RESET to confirm"
          className="w-40"
        />
        <button
          onClick={handleReset}
          disabled={confirmText !== "RESET"}
          className="btn btn-danger"
        >
          Clear everything
        </button>
      </div>
    </div>
  );
}

/* ─── Help Guide ─── */

function HelpGuide({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="space-y-6">
      <div className="surface p-6">
        <h2 className="text-xl font-medium">Welcome to Cash Clarity</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          This dashboard helps your family see exactly where your cash stands — not just today,
          but 28 days out. No guessing, no surprises. Check the Expenses tab to manage your
          bills and income, or visit the Dashboard for a full overview.
        </p>
      </div>
      <ResetDataCard onRefresh={onRefresh} />
    </div>
  );
}
