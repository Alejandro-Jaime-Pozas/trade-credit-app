"use client";

/**
 * Shared page chrome: header nav, signed-in user info, logout, footer.
 *
 * Wraps most page content so every screen has consistent navigation
 * (Dashboard, Customers) and auth actions without duplicating markup.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { useAuth } from "@/lib/auth";

function NavLink(props: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === props.href || pathname.startsWith(`${props.href}/`);
  return (
    <Link
      href={props.href}
      className={[
        "text-sm font-medium transition-colors",
        active ? "text-zinc-900" : "text-zinc-600 hover:text-zinc-900",
      ].join(" ")}
    >
      {props.label}
    </Link>
  );
}

export function AppShell(props: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-full flex flex-col bg-zinc-50">
      <header className="border-b bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Trade Credit App
            </Link>
            <nav className="hidden sm:flex items-center gap-4">
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/customers" label="Customers" />
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden sm:block text-sm text-zinc-600">
                  Signed in as <span className="font-medium">{user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    router.push("/login");
                  }}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
                >
                  Log out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-zinc-50"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">{props.children}</div>
      </main>
      <footer className="border-t bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-zinc-500">
          Dev mode. API base:{" "}
          <span className="font-mono">{process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1"}</span>
        </div>
      </footer>
    </div>
  );
}

