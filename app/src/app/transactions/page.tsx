"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import LedgerStatement from "@/components/LedgerStatement";

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data))
      .catch((err) => console.error("Failed to fetch accounts:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  if (loading) {
    return (
      <>
        <Nav />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500 font-medium">Loading transactions...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex-1">
        <LedgerStatement accounts={accounts} onRefresh={fetchAccounts} />
      </main>
    </>
  );
}
