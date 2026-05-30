"use client";

import { useEffect, useState, useCallback } from "react";
import CashPositionStrip from "@/components/CashPositionStrip";
import ProjectionChart from "@/components/ProjectionChart";
import QuickActions from "@/components/QuickActions";
import Nav from "@/components/Nav";
import RunwayView from "@/components/RunwayView";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import { Account, AllocationInput, CommitmentInstance, LedgerItemInput, ProjectionDay } from "@/lib/types";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [projection, setProjection] = useState<ProjectionDay[]>([]);
  const [trendProjection, setTrendProjection] = useState<ProjectionDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [projectionDays, setProjectionDays] = useState<14 | 30 | 60 | 90 | 120 | 150 | 180>(30);
  const [includePending, setIncludePending] = useState(true);

  const fetchProjection = useCallback(async (days?: number, pending?: boolean) => {
    const params = new URLSearchParams();
    params.set("days", String(days ?? projectionDays));
    params.set("include_pending", (pending ?? includePending) ? "1" : "0");
    const res = await authFetch(`/api/projections?${params.toString()}`);
    return readJsonArray<ProjectionDay>(res, "Projection fetch");
  }, [projectionDays, includePending]);

  const fetchAll = useCallback(async () => {
    try {
      const [acctRes, proj, trendProj] = await Promise.all([
        authFetch("/api/accounts"),
        fetchProjection(),
        fetchProjection(180),
      ]);
      const [accts] = await Promise.all([readJsonArray<Account>(acctRes, "Accounts fetch")]);
      setAccounts(accts);
      setProjection(proj);
      setTrendProjection(trendProj);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchProjection]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

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

  const handleAddCommitment = async (data: {
    name: string;
    type: string;
    amount: number;
    due_date: string;
    recurrence_rule: string;
    priority: string;
    autopay: boolean;
    account_id: string;
  }) => {
    await authFetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  const handleSyncWithBank = async (id: string, balance: number) => {
    await authFetch("/api/accounts/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, actual_balance: balance }),
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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
          <p className="mt-4 text-sm text-slate-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Nav />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6 flex-1 w-full">
        <CashPositionStrip accounts={accounts} projection={trendProjection} lastUpdated={lastUpdated} />

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
          onUpdateInstance={handleUpdateInstance}
        />

        <div className="border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
          <QuickActions
            accounts={accounts}
            onAddCommitment={handleAddCommitment}
            onReconcile={handleSyncWithBank}
            onAddAccount={handleAddAccount}
            onLogTransaction={handleLogTransaction}
          />
        </div>
      </main>
    </>
  );
}
