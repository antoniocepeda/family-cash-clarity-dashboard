"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import UpcomingCommitments from "@/components/UpcomingCommitments";
import { CommitmentWithInstances } from "@/lib/types";

export default function CommitmentsPage() {
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatedIds, setSimulatedIds] = useState<Set<string>>(new Set());

  const fetchCommitments = useCallback(async () => {
    try {
      const res = await fetch("/api/commitments");
      const data = await res.json();
      setCommitments(data);
    } catch (err) {
      console.error("Failed to fetch commitments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommitments();
  }, [fetchCommitments]);

  const handleMarkPaid = async (id: string, actualAmount: number, instanceDueDate: string, note?: string) => {
    await fetch("/api/commitments/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, actual_amount: actualAmount, instance_due_date: instanceDueDate, note }),
    });
    fetchCommitments();
  };

  const handleRollover = async (id: string, instanceDueDate: string) => {
    await fetch("/api/commitments/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, instance_due_date: instanceDueDate }),
    });
    fetchCommitments();
  };

  const handleEditInstanceAmount = async (commitmentId: string, dueDate: string, newAmount: number) => {
    await fetch("/api/commitment-instances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commitment_id: commitmentId, due_date: dueDate, planned_amount: newAmount }),
    });
    fetchCommitments();
  };

  const handleLeftover = async (commitmentId: string, instanceDueDate: string, action: "rollover" | "release") => {
    await fetch("/api/commitments/leftover", {
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
            <p className="mt-4 text-sm text-slate-500 font-medium">Loading commitments...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex-1">
        <UpcomingCommitments
          commitments={commitments}
          onMarkPaid={handleMarkPaid}
          onRollover={handleRollover}
          onEditInstanceAmount={handleEditInstanceAmount}
          onLeftover={handleLeftover}
          simulatedIds={simulatedIds}
          onSimulateToggle={handleSimulateToggle}
        />
      </main>
    </>
  );
}
