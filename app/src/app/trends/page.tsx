"use client";

import Nav from "@/components/Nav";
import SpendingTrends from "@/components/SpendingTrends";

export default function TrendsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <SpendingTrends />
      </main>
    </div>
  );
}
