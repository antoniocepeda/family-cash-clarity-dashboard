"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PUBLIC_PATHS } from "@/components/auth/AuthProvider";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (PUBLIC_PATHS.has(pathname)) return <>{children}</>;

  if (loading || !user) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="spinner" role="status" aria-label="Loading" />
          <p className="mt-4 text-sm text-[var(--muted)]">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
