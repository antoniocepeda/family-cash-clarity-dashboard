"use client";

import { useEffect, useState, useCallback } from "react";
import Nav from "@/components/Nav";
import LedgerStatement from "@/components/LedgerStatement";
import { authFetch } from "@/lib/auth-fetch";

export default function TransactionsPage() {
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(() => {
    authFetch("/api/accounts")
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
            <div className="spinner" role="status" aria-label="Loading" />
            <p className="mt-4 text-sm text-[var(--muted)]">Loading transactions...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="page-shell">
        <LedgerStatement accounts={accounts} onRefresh={fetchAccounts} />
      </main>
    </>
  );
}
