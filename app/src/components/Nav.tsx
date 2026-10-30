"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="shell flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
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
                  className={`rounded-full px-3 py-2 text-sm transition-colors lg:px-4 lg:text-base ${
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
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="btn btn-ghost mt-3 w-full"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
