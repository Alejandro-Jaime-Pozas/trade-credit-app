"use client";

/**
 * Route guard for pages that need a logged-in user.
 *
 * Wrap protected page content in `<RequireAuth>…</RequireAuth>`. If there is no
 * user (and auth is done loading), redirects to `/login`. Shows "Loading…"
 * while `AuthProvider` restores the session from stored JWT tokens.
 */
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export function RequireAuth(props: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return <div className="text-sm text-zinc-600">Loading…</div>;
  }

  if (!user) {
    return null;
  }

  return <>{props.children}</>;
}

