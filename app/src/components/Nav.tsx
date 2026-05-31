"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { authFetch } from "@/lib/auth-fetch";

export default function Nav() {
  const pathname = usePathname();
  const { user, signOutUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/expenses", label: "Cash Calendar" },
    { href: "/transactions", label: "Transactions" },
    { href: "/manage", label: "Manage" },
  ];

  const handleSyncBank = async () => {
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await authFetch("/api/plaid/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) {
        throw new Error(data.error || "Bank sync failed");
      }
      if (typeof data.items === "number" && data.items === 0) {
        setSyncError("No linked banks yet. Connect a bank in Manage first.");
        return;
      }
      if (data.errors?.length) {
        setSyncError(`Synced with ${data.errors.length} item error${data.errors.length === 1 ? "" : "s"}.`);
      } else {
        const refreshNote =
          data.refresh_requested > 0
            ? ` Refresh requested for ${data.refresh_requested} bank link${data.refresh_requested === 1 ? "" : "s"}; very recent posted transactions may appear after the next Plaid update.`
            : "";
        setSyncMessage(
          `Bank sync complete: ${data.accounts ?? 0} accounts, ${data.added ?? 0} new, ${data.modified ?? 0} updated, ${data.removed ?? 0} removed.${refreshNote}`
        );
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Bank sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckBank = async () => {
    setChecking(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await authFetch("/api/plaid/sync", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Bank status check failed");
      }
      const items = Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        setSyncError("No linked banks found. Connect a bank in Manage.");
        return;
      }

      const errorItems = items.filter((item: { status?: string }) => item.status === "error");
      if (errorItems.length > 0) {
        const names = errorItems
          .slice(0, 2)
          .map((item: { institution_name?: string | null }) => item.institution_name || "Linked institution")
          .join(", ");
        setSyncError(
          `${errorItems.length} linked bank ${errorItems.length === 1 ? "has" : "have"} an issue (${names}). Open Manage for details.`
        );
        return;
      }

      setSyncMessage(`Bank links look healthy: ${items.length} institution${items.length === 1 ? "" : "s"} connected.`);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Bank status check failed");
    } finally {
      setChecking(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="shrink-0">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Cash Clarity</h1>
            <p className="text-[10px] text-slate-400 -mt-0.5">Family Dashboard</p>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleCheckBank()}
            disabled={checking || syncing}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            {checking ? "Checking..." : "Check Bank"}
          </button>
          <button
            type="button"
            onClick={() => void handleSyncBank()}
            disabled={syncing || checking}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
          >
            {syncing ? "Syncing..." : "Sync Bank"}
          </button>
          {user?.email && (
            <span className="hidden sm:inline text-xs font-medium text-slate-500">
              {user.email}
            </span>
          )}
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Sign out
          </button>
        </div>
      </div>
      {(syncMessage || syncError) && (
        <div className={`border-t px-4 sm:px-6 py-2 text-xs font-medium ${syncError ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          <div className="mx-auto max-w-6xl">{syncError || syncMessage}</div>
        </div>
      )}
    </header>
  );
}
