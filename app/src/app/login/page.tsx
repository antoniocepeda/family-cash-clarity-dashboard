"use client";

import { FormEvent, ReactNode, Suspense, useState } from "react";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthorizedEmail } from "@/lib/authorized-users";
import { getFirebaseAuth } from "@/lib/firebase/client";

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

  const next = searchParams.get("next") || "/";
  const initialError = searchParams.get("error") === "unauthorized"
    ? "That account is not authorized for this dashboard."
    : "";
  const redirectAfterSignIn = () => {
    router.replace(next.startsWith("/") ? next : "/");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
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
      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-600">
            G
          </span>
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {(error || initialError) && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error || initialError}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </LoginShell>
  );
}

function LoginShell({ children }: { children?: ReactNode }) {
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cash Clarity</h1>
          <p className="mt-2 text-sm text-slate-500">
            Sign in to access the family dashboard.
          </p>
        </div>
        {children ?? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="h-10 w-10 mx-auto rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
          </div>
        )}
      </div>
    </main>
  );
}
