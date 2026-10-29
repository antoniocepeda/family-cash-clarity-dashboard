"use client";

import Nav from "@/components/Nav";
import SpendingTrends from "@/components/SpendingTrends";

export default function TrendsPage() {
  return (
    <>
      <Nav />
      <main className="page-shell">
        <SpendingTrends />
      </main>
    </>
  );
}
