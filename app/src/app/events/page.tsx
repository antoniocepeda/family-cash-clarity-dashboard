"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import UpcomingEvents from "@/components/UpcomingEvents";
import { CashEventWithInstances, ProjectionDay } from "@/lib/types";

export default function EventsPage() {
  const [events, setEvents] = useState<CashEventWithInstances[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatedIds, setSimulatedIds] = useState<Set<string>>(new Set());

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events");
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      console.error("Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleMarkPaid = async (id: string, actualAmount: number, instanceDueDate: string, note?: string) => {
    await fetch("/api/events/mark-paid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, actual_amount: actualAmount, instance_due_date: instanceDueDate, note }),
    });
    fetchEvents();
  };

  const handleRollover = async (id: string, instanceDueDate: string) => {
    await fetch("/api/events/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, instance_due_date: instanceDueDate }),
    });
    fetchEvents();
  };

  const handleEditInstanceAmount = async (eventId: string, dueDate: string, newAmount: number) => {
    await fetch("/api/event-instances", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, due_date: dueDate, planned_amount: newAmount }),
    });
    fetchEvents();
  };

  const handleLeftover = async (eventId: string, instanceDueDate: string, action: "rollover" | "release") => {
    await fetch("/api/events/leftover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, instance_due_date: instanceDueDate, action }),
    });
    fetchEvents();
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
      <div className="min-h-screen bg-slate-50">
        <Nav />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500 font-medium">Loading events...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <UpcomingEvents
          events={events}
          onMarkPaid={handleMarkPaid}
          onRollover={handleRollover}
          onEditInstanceAmount={handleEditInstanceAmount}
          onLeftover={handleLeftover}
          simulatedIds={simulatedIds}
          onSimulateToggle={handleSimulateToggle}
        />
      </main>
    </div>
  );
}
