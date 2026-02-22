"use client";

import Nav from "@/components/Nav";
import SpendingTrends from "@/components/SpendingTrends";

export default function TrendsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex-1">
        <SpendingTrends />
      </main>
    </>
  );
}
