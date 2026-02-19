"use client";

import { useEffect, useState, useCallback } from "react";
import CashPositionStrip from "@/components/CashPositionStrip";
import RiskBanner from "@/components/RiskBanner";
import NextBills from "@/components/NextBills";
import ProjectionChart from "@/components/ProjectionChart";
import UpcomingEvents from "@/components/UpcomingEvents";
import QuickActions from "@/components/QuickActions";
import Nav from "@/components/Nav";
import { Account, CashEvent, ProjectionDay, Alert } from "@/lib/types";

export default function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<CashEvent[]>([]);
  const [projection, setProjection] = useState<ProjectionDay[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [acctRes, evtRes, projRes, alertRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/events"),
        fetch("/api/projections"),
        fetch("/api/alerts"),
      ]);
      const [accts, evts, proj, alts] = await Promise.all([
        acctRes.json(),
        evtRes.json(),
        projRes.json(),
        alertRes.json(),
      ]);
      setAccounts(accts);
      setEvents(evts);
      setProjection(proj);
      setAlerts(alts);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleMarkPaid = async (id: string) => {
    await fetch("/api/events/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchAll();
  };

  const handleAddEvent = async (data: {
    name: string;
    type: string;
    amount: number;
    due_date: string;
    recurrence_rule: string;
    priority: string;
    autopay: boolean;
    account_id: string;
  }) => {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  const handleReconcile = async (id: string, balance: number) => {
    await fetch("/api/accounts/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, actual_balance: balance }),
    });
    fetchAll();
  };

  const handleAddAccount = async (data: {
    name: string;
    type: string;
    current_balance: number;
    is_reserve: boolean;
  }) => {
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    fetchAll();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
          <p className="mt-4 text-sm text-slate-500 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 space-y-6">
        <CashPositionStrip accounts={accounts} lastUpdated={lastUpdated} />

        {alerts.filter((a) => a.severity === "critical" || a.severity === "warning").length > 0 && (
          <RiskBanner alerts={alerts.filter((a) => a.severity !== "info")} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <NextBills events={events} />
          </div>
          <div className="lg:col-span-2">
            <ProjectionChart projection={projection} />
          </div>
        </div>

        <UpcomingEvents events={events} onMarkPaid={handleMarkPaid} />

        <div className="border-t border-slate-200 pt-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h2>
          <QuickActions
            accounts={accounts}
            onAddEvent={handleAddEvent}
            onReconcile={handleReconcile}
            onAddAccount={handleAddAccount}
          />
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex items-center justify-between text-xs text-slate-400">
          <span>Family Cash Clarity Dashboard v1</span>
          <span>
            {accounts.length} accounts · {events.filter((e) => e.active).length} active events
          </span>
        </div>
      </footer>
    </div>
  );
}
