"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import LedgerStatement from "@/components/LedgerStatement";

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data))
      .catch((err) => console.error("Failed to fetch accounts:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Nav />
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500 font-medium">Loading transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        <LedgerStatement accounts={accounts} />
      </main>
    </div>
  );
}
