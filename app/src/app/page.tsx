"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { BACKGROUND_SYNC_MS, STALE_SYNC_MS, SYNC_FOLLOW_UP_MS } from "@/lib/schedule";
import { Account, AllocationInput, CommitmentInstance, CommitmentWithInstances, LedgerEntry, LedgerItemInput, PlaidItem, ProjectionDay } from "@/lib/types";

function newestSync(items: { last_synced_at?: string | null }[]) {
  const stamps = items.map((item) => item.last_synced_at).filter((value): value is string => Boolean(value)).sort();
  return stamps.at(-1) ?? null;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
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

  const bankSyncLock = useRef(false);
  const followUpRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncBank = useCallback(async (mode: "if-stale" | "pull") => {
    let knownLast: string | null = null;
    if (mode === "if-stale") {
      const statusRes = await authFetch("/api/plaid/sync");
      const status = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) return { syncedAt: null, didSync: false };
      const items = Array.isArray(status.items) ? status.items as PlaidItem[] : [];
      knownLast = newestSync(items);
      const stale = items.length > 0 && (!knownLast || Date.now() - new Date(knownLast).getTime() > STALE_SYNC_MS);
      if (!stale) return { syncedAt: knownLast, didSync: false };
    }
    if (bankSyncLock.current) return { syncedAt: knownLast, didSync: false };
    bankSyncLock.current = true;
    setSyncing(true);
    try {
      const refresh = mode === "pull" ? "0" : "1";
      const syncRes = await authFetch(`/api/plaid/sync?refresh=${refresh}`, { method: "POST" });
      if (!syncRes.ok && syncRes.status !== 207) return { syncedAt: knownLast, didSync: false };
      return { syncedAt: new Date().toISOString(), didSync: true };
    } finally {
      bankSyncLock.current = false;
      setSyncing(false);
    }
  }, []);

  const reloadAfterSync = useCallback(async () => {
    try {
      const [acctRes, proj, trendProj, ledgerRes, promptRes] = await Promise.all([
        authFetch("/api/accounts"),
        fetchProjection(),
        fetchProjection(180, true),
        authFetch("/api/ledger"),
        authFetch("/api/reconcile"),
      ]);
      setAccounts(await readJsonArray<Account>(acctRes, "Accounts fetch"));
      setProjection(proj);
      setTrendProjection(trendProj);
      setLedger(await readJsonArray<LedgerEntry>(ledgerRes, "Ledger fetch"));
      const promptsBody = await promptRes.json().catch(() => ({}));
      if (promptRes.ok && Array.isArray(promptsBody.prompts)) setPrompts(promptsBody.prompts);
    } catch (err) {
      console.error("Figure refresh failed:", err);
    }
  }, [fetchProjection]);

  const scheduleFollowUp = useCallback(() => {
    if (followUpRef.current) clearTimeout(followUpRef.current);
    followUpRef.current = setTimeout(() => {
      followUpRef.current = null;
      void (async () => {
        try {
          const bank = await syncBank("pull");
          if (!bank.didSync) return;
          setLastSyncedAt(bank.syncedAt);
          await reloadAfterSync();
        } catch (err) {
          console.error("Follow-up bank sync failed:", err);
        }
      })();
    }, SYNC_FOLLOW_UP_MS);
  }, [reloadAfterSync, syncBank]);

  const fetchAll = useCallback(async () => {
    try {
      let syncedAt: string | null = null;
      if (user) {
        try {
          const bank = await syncBank("if-stale");
          syncedAt = bank.syncedAt;
          if (bank.didSync) scheduleFollowUp();
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
      const [acctRes, proj, trendProj, cmtRes, ledgerRes] = await Promise.all([
        authFetch("/api/accounts"),
        fetchProjection(),
        fetchProjection(180, true),
        authFetch("/api/commitments"),
        authFetch("/api/ledger"),
      ]);
      const [accts, cmts, entries] = await Promise.all([
        readJsonArray<Account>(acctRes, "Accounts fetch"),
        readJsonArray<CommitmentWithInstances>(cmtRes, "Commitments fetch"),
        readJsonArray<LedgerEntry>(ledgerRes, "Ledger fetch"),
      ]);
      setAccounts(accts);
      setCommitments(cmts);
      setLedger(entries);
      setProjection(proj);
      setTrendProjection(trendProj);
      setLastSyncedAt(syncedAt);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchProjection, scheduleFollowUp, syncBank, user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void fetchAll();
  }, [fetchAll, user]);

  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const bank = await syncBank("if-stale");
          if (!bank.didSync) return;
          setLastSyncedAt(bank.syncedAt);
          await reloadAfterSync();
          scheduleFollowUp();
        } catch (err) {
          console.error("Background bank sync failed:", err);
        }
      })();
    };
    const interval = window.setInterval(tick, BACKGROUND_SYNC_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reloadAfterSync, scheduleFollowUp, syncBank, user]);

  useEffect(() => {
    return () => {
      if (followUpRef.current) clearTimeout(followUpRef.current);
    };
  }, []);

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
      const [acctRes, proj, trendProj, ledgerRes] = await Promise.all([
        authFetch("/api/accounts"),
        fetchProjection(),
        fetchProjection(180, true),
        authFetch("/api/ledger"),
      ]);
      setAccounts(await readJsonArray<Account>(acctRes, "Accounts fetch"));
      setProjection(proj);
      setTrendProjection(trendProj);
      setLedger(await readJsonArray<LedgerEntry>(ledgerRes, "Ledger fetch"));
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
          ledger={ledger}
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
