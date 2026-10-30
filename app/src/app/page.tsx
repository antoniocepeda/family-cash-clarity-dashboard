"use client";

import { useEffect, useState, useCallback } from "react";
import ClarityHome from "@/components/ClarityHome";
import ProjectionChart from "@/components/ProjectionChart";
import QuickActions from "@/components/QuickActions";
import Nav from "@/components/Nav";
import RunwayView from "@/components/RunwayView";
import AgentActivity from "@/components/AgentActivity";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/components/auth/AuthProvider";
import { HelpPrompt, restorePrompt, withoutPrompt } from "@/lib/reconcile";
import { STALE_SYNC_MS } from "@/lib/schedule";
import { Account, AllocationInput, CommitmentInstance, CommitmentWithInstances, LedgerItemInput, PlaidItem, ProjectionDay } from "@/lib/types";

function newestSync(items: { last_synced_at?: string | null }[]) {
  const stamps = items.map((item) => item.last_synced_at).filter((value): value is string => Boolean(value)).sort();
  return stamps.at(-1) ?? null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [projection, setProjection] = useState<ProjectionDay[]>([]);
  const [trendProjection, setTrendProjection] = useState<ProjectionDay[]>([]);
  const [prompts, setPrompts] = useState<HelpPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [projectionDays, setProjectionDays] = useState<14 | 30 | 60 | 90 | 120 | 150 | 180>(30);
  const [includePending, setIncludePending] = useState(true);

  const fetchProjection = useCallback(async (days?: number, pending?: boolean) => {
    const params = new URLSearchParams();
    params.set("days", String(days ?? projectionDays));
    params.set("include_pending", (pending ?? includePending) ? "1" : "0");
    const res = await authFetch(`/api/projections?${params.toString()}`);
    return readJsonArray<ProjectionDay>(res, "Projection fetch");
  }, [projectionDays, includePending]);

  const refreshBankIfStale = useCallback(async () => {
    const statusRes = await authFetch("/api/plaid/sync");
    const status = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) return null;
    const items = Array.isArray(status.items) ? status.items as PlaidItem[] : [];
    const last = newestSync(items);
    const stale = items.length > 0 && (!last || Date.now() - new Date(last).getTime() > STALE_SYNC_MS);
    if (!stale) return last;
    setSyncing(true);
    try {
      const syncRes = await authFetch("/api/plaid/sync", { method: "POST" });
      if (!syncRes.ok && syncRes.status !== 207) return last;
      return new Date().toISOString();
    } finally {
      setSyncing(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      let syncedAt: string | null = null;
      if (user) {
        try {
          syncedAt = await refreshBankIfStale();
        } catch (err) {
          console.error("Bank refresh failed:", err);
        }
        try {
          const reconcileRes = await authFetch("/api/reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run" }),
          });
          const reconcile = await reconcileRes.json().catch(() => ({}));
          setPrompts(Array.isArray(reconcile.prompts) ? reconcile.prompts : []);
        } catch (err) {
          console.error("Reconcile failed:", err);
        }
      }
      const [acctRes, proj, trendProj, cmtRes] = await Promise.all([
        authFetch("/api/accounts"),
        fetchProjection(),
        fetchProjection(180, false),
        authFetch("/api/commitments"),
      ]);
      const [accts, cmts] = await Promise.all([
        readJsonArray<Account>(acctRes, "Accounts fetch"),
        readJsonArray<CommitmentWithInstances>(cmtRes, "Commitments fetch"),
      ]);
      setAccounts(accts);
      setCommitments(cmts);
      setProjection(proj);
      setTrendProjection(trendProj);
      setLastSyncedAt(syncedAt);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchProjection, refreshBankIfStale, user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void fetchAll();
  }, [fetchAll, user]);

  const handleProjectionDaysChange = (days: 14 | 30 | 60 | 90 | 120 | 150 | 180) => {
    setProjectionDays(days);
    fetchProjection(days).then(setProjection);
  };

  const handleIncludePendingChange = (next: boolean) => {
    setIncludePending(next);
    fetchProjection(projectionDays, next).then(setProjection);
  };

  const handleUpdateInstance = async (data: {
    commitment_id: string;
    original_due_date: string;
    due_date: string;
    planned_amount: number;
    status: CommitmentInstance["status"];
    scope: "instance" | "future" | "template";
  }) => {
    await authFetch("/api/commitment-instances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  const refreshFigures = useCallback(async () => {
    try {
      const [acctRes, proj, trendProj] = await Promise.all([
        authFetch("/api/accounts"),
        fetchProjection(),
        fetchProjection(180, false),
      ]);
      setAccounts(await readJsonArray<Account>(acctRes, "Accounts fetch"));
      setProjection(proj);
      setTrendProjection(trendProj);
    } catch (err) {
      console.error("Figure refresh failed:", err);
    }
  }, [fetchProjection]);

  const handleResolvePrompt = async (promptId: string, choiceId: string) => {
    const removed = prompts.find((prompt) => prompt.id === promptId);
    setResolveError(null);
    setPrompts((current) => withoutPrompt(current, promptId));
    try {
      const res = await authFetch("/api/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", promptId, choiceId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (removed) setPrompts((current) => restorePrompt(current, removed));
        setResolveError(typeof body.error === "string" ? body.error : "Could not update that match");
        return;
      }
      void refreshFigures();
    } catch (err) {
      if (removed) setPrompts((current) => restorePrompt(current, removed));
      setResolveError(err instanceof Error ? err.message : "Could not update that match");
    }
  };

  const handleAddCommitment = async (data: {
    name: string;
    type: string;
    amount: number;
    due_date: string;
    recurrence_rule: string;
    account_id: string;
  }) => {
    await authFetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  const handleLogTransaction = async (data: {
    description: string;
    amount: number;
    type: string;
    account_id: string;
    allocations: AllocationInput[];
    items: LedgerItemInput[];
  }) => {
    await authFetch("/api/ledger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  const handleAddAccount = async (data: {
    name: string;
    type: string;
    current_balance: number;
    is_reserve: boolean;
  }) => {
    await authFetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  if (loading) {
    return (
      <>
        <Nav />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="spinner" role="status" aria-label="Loading" />
            <p className="mt-4 text-sm text-[var(--muted)]">Loading dashboard...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />

      <main className="page-shell">
        <ClarityHome
          accounts={accounts}
          commitments={commitments}
          projection={trendProjection}
          prompts={prompts}
          lastSyncedAt={lastSyncedAt}
          syncing={syncing}
          resolveError={resolveError}
          onResolve={user ? handleResolvePrompt : undefined}
        />

        <div>
          <ProjectionChart
            projection={projection}
            projectionDays={projectionDays}
            onDaysChange={handleProjectionDaysChange}
            includePending={includePending}
            onIncludePendingChange={handleIncludePendingChange}
          />
        </div>

        <RunwayView
          projection={projection}
          rangeDays={projectionDays === 14 || projectionDays === 30 || projectionDays === 60 ? projectionDays : 30}
          onRangeChange={handleProjectionDaysChange}
          onUpdateInstance={user ? handleUpdateInstance : undefined}
        />

        {user && <div className="border-t border-[var(--line)] pt-6">
          <h2 className="eyebrow mb-4">Quick actions</h2>
          <QuickActions
            accounts={accounts}
            onAddCommitment={handleAddCommitment}
            onAddAccount={handleAddAccount}
            onLogTransaction={handleLogTransaction}
          />
        </div>}

        {user && <AgentActivity />}
      </main>
    </>
  );
}
