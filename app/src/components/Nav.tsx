"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { authFetch } from "@/lib/auth-fetch";

const links = [
  { href: "/", label: "Home" },
  { href: "/expenses", label: "Calendar" },
  { href: "/transactions", label: "Ledger" },
  { href: "/manage", label: "Accounts" },
  { href: "/trends", label: "Trends" },
];

export default function Nav() {
  const pathname = usePathname();
  const { user, signOutUser } = useAuth();
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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
    <>
      <header className="topbar">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" className="shrink-0">
              <p className="eyebrow">Cash</p>
              <p className="-mt-0.5 text-[15px] font-medium tracking-tight text-[var(--text)]">Clarity</p>
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-full px-3 py-2 text-sm transition-colors ${
                      active
                        ? "text-[var(--text)]"
                        : "text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => void handleCheckBank()}
                  disabled={checking || syncing}
                  className="btn btn-ghost"
                >
                  {checking ? "Checking..." : "Check bank"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSyncBank()}
                  disabled={syncing || checking}
                  className="btn btn-ghost"
                >
                  {syncing ? "Syncing..." : "Sync bank"}
                </button>
              </>
            )}
            {user?.email && (
              <span className="max-w-40 truncate text-xs text-[var(--muted)]">{user.email}</span>
            )}
            {user ? (
              <button type="button" onClick={() => void signOutUser()} className="btn btn-ghost">
                Sign out
              </button>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-primary">
                Sign in
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {!user && (
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="btn btn-primary px-4">
                Sign in
              </Link>
            )}
            {user && (
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-controls="account-menu"
                onClick={() => setMenuOpen((open) => !open)}
                className="btn btn-ghost px-3"
              >
                Menu
              </button>
            )}
          </div>
        </div>

        {menuOpen && user && (
          <div id="account-menu" className="border-t border-[var(--line)] px-4 py-3 md:hidden">
            <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCheckBank()}
                disabled={checking || syncing}
                className="btn btn-ghost"
              >
                {checking ? "Checking..." : "Check bank"}
              </button>
              <button
                type="button"
                onClick={() => void handleSyncBank()}
                disabled={syncing || checking}
                className="btn btn-ghost"
              >
                {syncing ? "Syncing..." : "Sync bank"}
              </button>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="btn btn-ghost col-span-2"
              >
                Sign out
              </button>
            </div>
          </div>
        )}

        {(syncMessage || syncError) && (
          <div
            className={`border-t px-4 py-2 text-xs sm:px-6 ${
              syncError
                ? "border-[var(--line)] bg-[var(--negative-soft)] text-[var(--negative)]"
                : "border-[var(--line)] bg-[var(--positive-soft)] text-[var(--positive)]"
            }`}
          >
            <div className="mx-auto max-w-6xl">{syncError || syncMessage}</div>
          </div>
        )}
      </header>
    </>
  );
}
