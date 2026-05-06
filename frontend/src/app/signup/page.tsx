"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { AppShell } from "@/components/AppShell";
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
        <p className="mt-2 text-sm text-zinc-600">
          Creates a user in the backend. An organization is auto-linked based on email
          domain.
        </p>

        <form
          className="mt-6 space-y-4 rounded-lg border bg-white p-6"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              await signup({ email: email.trim(), password });
              router.push("/dashboard");
            } catch (err) {
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
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>

          <div className="text-sm text-zinc-600">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-zinc-900 underline">
              Log in
            </Link>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

