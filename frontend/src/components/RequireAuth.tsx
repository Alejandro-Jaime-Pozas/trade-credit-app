"use client";

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

