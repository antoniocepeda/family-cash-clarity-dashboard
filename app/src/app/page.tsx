"use client";

import { useEffect, useState, useCallback } from "react";
import CashPositionStrip from "@/components/CashPositionStrip";
import RiskBanner from "@/components/RiskBanner";
import NextBills from "@/components/NextBills";
import ProjectionChart from "@/components/ProjectionChart";
import QuickActions from "@/components/QuickActions";
import Nav from "@/components/Nav";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import { Account, CommitmentWithInstances, AllocationInput, LedgerItemInput, ProjectionDay, Alert } from "@/lib/types";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [projection, setProjection] = useState<ProjectionDay[]>([]);
  const [trendProjection, setTrendProjection] = useState<ProjectionDay[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [projectionDays, setProjectionDays] = useState<28 | 60 | 90 | 120 | 150 | 180>(28);

  const fetchProjection = useCallback(async (days?: number) => {
    const params = new URLSearchParams();
    params.set("days", String(days ?? projectionDays));
    const res = await authFetch(`/api/projections?${params.toString()}`);
    return readJsonArray<ProjectionDay>(res, "Projection fetch");
  }, [projectionDays]);

  const fetchAll = useCallback(async () => {
    try {
      const [acctRes, cmtRes, proj, trendProj, alertRes] = await Promise.all([
        authFetch("/api/accounts"),
        authFetch("/api/commitments"),
        fetchProjection(),
        fetchProjection(180),
        authFetch("/api/alerts"),
      ]);
      const [accts, cmts, alts] = await Promise.all([
        readJsonArray<Account>(acctRes, "Accounts fetch"),
        readJsonArray<CommitmentWithInstances>(cmtRes, "Commitments fetch"),
        readJsonArray<Alert>(alertRes, "Alerts fetch"),
      ]);
      setAccounts(accts);
      setCommitments(cmts);
      setProjection(proj);
      setTrendProjection(trendProj);
      setAlerts(alts);
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

  const handleProjectionDaysChange = (days: 28 | 60 | 90 | 120 | 150 | 180) => {
    setProjectionDays(days);
    fetchProjection(days).then(setProjection);
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

        {alerts.filter((a) => a.severity === "critical" || a.severity === "warning").length > 0 && (
          <RiskBanner alerts={alerts.filter((a) => a.severity !== "info")} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          <div className="lg:col-span-1 flex flex-col">
            <NextBills commitments={commitments} />
          </div>
          <div className="lg:col-span-2 flex flex-col">
            <ProjectionChart
              projection={projection}
              projectionDays={projectionDays}
              onDaysChange={handleProjectionDaysChange}
            />
          </div>
        </div>

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
