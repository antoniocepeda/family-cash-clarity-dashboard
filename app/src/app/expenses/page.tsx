"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import UpcomingCommitments from "@/components/UpcomingCommitments";
import { CommitmentWithInstances } from "@/lib/types";

export default function ExpensesPage() {
  const [commitments, setCommitments] = useState<CommitmentWithInstances[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatedIds, setSimulatedIds] = useState<Set<string>>(new Set());

  const fetchCommitments = useCallback(async () => {
    try {
      const res = await fetch("/api/commitments");
      const cmts = await res.json();
      setCommitments(cmts);
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
            <p className="mt-4 text-sm text-slate-500 font-medium">Loading expenses...</p>
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
