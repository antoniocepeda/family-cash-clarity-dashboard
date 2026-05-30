"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import CashCalendar from "@/components/CashCalendar";
import UpcomingCommitments from "@/components/UpcomingCommitments";
import { readJsonArray } from "@/lib/api-client";
import { authFetch } from "@/lib/auth-fetch";
import { Account, CommitmentInstance, CommitmentWithInstances, ProjectionDay } from "@/lib/types";

export default function ExpensesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [projection, setProjection] = useState<ProjectionDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatedIds, setSimulatedIds] = useState<Set<string>>(new Set());

  const fetchCommitments = useCallback(async () => {
    try {
      const [accountRes, commitmentRes] = await Promise.all([
        authFetch("/api/accounts"),
        authFetch("/api/commitments?include_inactive=1"),
      ]);
      const [accts, cmts] = await Promise.all([
        readJsonArray<Account>(accountRes, "Accounts fetch"),
        readJsonArray<CommitmentWithInstances>(commitmentRes, "Commitments fetch"),
      ]);
      setAccounts(accts);
      setCommitments(cmts);
      const projectionRes = await authFetch("/api/projections?days=42");
      setProjection(await readJsonArray<ProjectionDay>(projectionRes, "Projection fetch"));
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommitments();
  }, [fetchCommitments]);

  const handleRollover = async (id: string, instanceDueDate: string) => {
    await authFetch("/api/commitments/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, instance_due_date: instanceDueDate }),
    });
    fetchCommitments();
  };

  const handleAddCashEvent = async (expense: {
    name: string;
    amount: number;
    due_date: string;
    recurrence_rule: string;
    type: "bill" | "income";
  }) => {
    const accountId = accounts[0]?.id ?? "";
    await authFetch("/api/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...expense,
        account_id: accountId,
      }),
    });
    await fetchCommitments();
  };

  const handleEditInstanceAmount = async (commitmentId: string, dueDate: string, newAmount: number) => {
    await authFetch("/api/commitment-instances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment_id: commitmentId, due_date: dueDate, planned_amount: newAmount }),
    });
    fetchCommitments();
  };

  const handleUpdateInstance = async (input: {
    commitment_id: string;
    original_due_date: string;
    due_date: string;
    planned_amount: number;
    status: CommitmentInstance["status"];
    scope: "instance" | "future" | "template";
    name?: string;
  }) => {
    await authFetch("/api/commitment-instances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    await fetchCommitments();
  };

  const handleReceiveIncome = async (commitmentId: string, dueDate: string, actualAmount: number) => {
    await authFetch("/api/commitments/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: commitmentId, instance_due_date: dueDate, actual_amount: actualAmount }),
    });
    fetchCommitments();
  };

  const handleLeftover = async (commitmentId: string, instanceDueDate: string, action: "rollover" | "release") => {
    await authFetch("/api/commitments/leftover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment_id: commitmentId, instance_due_date: instanceDueDate, action }),
    });
    fetchCommitments();
  };

  const handleSimulateToggle = (id: string) => {
    setSimulatedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <>
        <Nav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500 font-medium">Loading expenses...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-[96vw] px-4 sm:px-6 py-6 flex-1 space-y-6">
        <CashCalendar
          projection={projection}
          onAddEvent={handleAddCashEvent}
          onUpdateInstance={handleUpdateInstance}
          onDeleteInstance={async (input) => {
            await authFetch("/api/commitment-instances", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            });
            await fetchCommitments();
          }}
        />
        <UpcomingCommitments
          commitments={commitments}
          onRollover={handleRollover}
          onEditInstanceAmount={handleEditInstanceAmount}
          onReceiveIncome={handleReceiveIncome}
          onLeftover={handleLeftover}
          simulatedIds={simulatedIds}
          onSimulateToggle={handleSimulateToggle}
        />
      </main>
    </>
  );
}
