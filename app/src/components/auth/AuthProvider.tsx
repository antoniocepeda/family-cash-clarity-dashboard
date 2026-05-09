"use client";

import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = new Set(["/login"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading) return;

    const isPublicPath = PUBLIC_PATHS.has(pathname);
    if (!user && !isPublicPath) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [loading, pathname, router, user]);

  const signOutUser = useCallback(async () => {
    await signOut(getFirebaseAuth());
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, signOutUser }),
    [loading, signOutUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
