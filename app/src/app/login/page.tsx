"use client";

import { FormEvent, ReactNode, Suspense, useState } from "react";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthorizedEmail } from "@/lib/authorized-users";
import { getFirebaseAuth, isFirebaseClientConfigured } from "@/lib/firebase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isFirebaseConfigured = isFirebaseClientConfigured();

  const next = searchParams.get("next") || "/";
  const errorParam = searchParams.get("error");
  const initialError = errorParam === "unauthorized"
    ? "That account is not authorized for this dashboard."
    : errorParam === "missing-config"
      ? "Firebase is not configured for local development."
      : "";
  const redirectAfterSignIn = () => {
    router.replace(next.startsWith("/") ? next : "/");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!isFirebaseConfigured) {
      setError("Add Firebase values to app/.env.local, then restart npm run dev.");
      return;
    }

    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!isAuthorizedEmail(credential.user.email)) {
        await signOut(auth);
        throw new Error("unauthorized");
      }
      redirectAfterSignIn();
    } catch (err) {
      setError(err instanceof Error && err.message === "unauthorized"
        ? "That account is not authorized for this dashboard."
        : "Unable to sign in with that email and password.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");

    if (!isFirebaseConfigured) {
      setError("Add Firebase values to app/.env.local, then restart npm run dev.");
      return;
    }

    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const credential = await signInWithPopup(auth, provider);
      if (!isAuthorizedEmail(credential.user.email)) {
        await signOut(auth);
        throw new Error("unauthorized");
      }
      redirectAfterSignIn();
    } catch (err) {
      setError(err instanceof Error && err.message === "unauthorized"
        ? "That account is not authorized for this dashboard."
        : "Unable to sign in with Google. Check that Google is enabled in Firebase Authentication.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell>
      <form onSubmit={handleSubmit} className="surface space-y-4 p-5">
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading || !isFirebaseConfigured}
          className="btn btn-ghost w-full"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--accent)]">
            G
          </span>
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-[var(--surface-3)]" />
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">or</span>
          <div className="h-px flex-1 bg-[var(--surface-3)]" />
        </div>

        <div>
          <label htmlFor="email" className="eyebrow">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={!isFirebaseConfigured}
            className="field mt-2"
          />
        </div>

        <div>
          <label htmlFor="password" className="eyebrow">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={!isFirebaseConfigured}
            className="field mt-2"
          />
        </div>

        {(error || initialError) && (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--negative)_35%,transparent)] bg-[var(--negative-soft)] px-3 py-2 text-sm text-[var(--negative)]">
            {error || initialError}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !isFirebaseConfigured}
          className="btn btn-primary w-full"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </LoginShell>
  );
}

function LoginShell({ children }: { children?: ReactNode }) {
  return (
    <main className="page-shell items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="eyebrow">Cash</p>
          <h1 className="mt-2 text-5xl font-medium tracking-[-0.05em] text-[var(--text)]">Clarity</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            Sign in to edit the family dashboard.
          </p>
        </div>
        {children ?? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
            <div className="h-10 w-10 mx-auto rounded-full border-4 border-[var(--line)] border-t-[var(--accent)] animate-spin" />
          </div>
        )}
      </div>
    </main>
  );
}
