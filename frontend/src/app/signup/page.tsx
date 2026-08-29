"use client";

/**
 * Sign-up page (`/signup`).
 *
 * Creates a new user via POST `/users/`, then logs in automatically so the
 * user lands on credit cases with a valid session.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { logError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Creates a user in the backend. An organization is auto-linked based on email
          domain.
        </p>

        <form
          className="mt-6 space-y-4 rounded-lg border bg-surface p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await signup({ email: email.trim(), password });
              router.push("/credit-cases");
            } catch (err) {
              logError("signup:submit", err);
              setError(err instanceof Error ? err.message : "Signup failed");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <label className="block">
            <div className="text-sm font-medium">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium">Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Minimum length enforced by backend"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-danger-line bg-danger-surface p-3 text-sm text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>

          <div className="text-sm text-fg-muted">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-fg underline">
              Log in
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

