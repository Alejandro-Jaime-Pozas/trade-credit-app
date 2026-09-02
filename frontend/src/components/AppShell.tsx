"use client";

/**
 * Shared page chrome: header nav, signed-in user info, logout, footer.
 *
 * Wraps most page content so every screen has consistent navigation
 * (Credit Cases, Customers), the light/dark theme button, and auth actions without
 * duplicating markup.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";

function NavLink(props: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === props.href || pathname.startsWith(`${props.href}/`);
  return (
    <Link
      href={props.href}
      className={[
        "text-sm font-medium transition-colors",
        active ? "text-fg" : "text-fg-muted hover:text-fg",
      ].join(" ")}
    >
      {props.label}
    </Link>
  );
}

export function AppShell(props: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // The header, content and footer bands all share the same width rules so they stay
  // aligned. There is deliberately no max-width: the layout used to be capped at 72rem,
  // which left a wide window mostly empty while the credit cases table scrolled
  // sideways inside it. It now uses whatever width the window offers, and still narrows
  // normally on small screens — the padding just grows at wider breakpoints so text
  // isn't flush against the edge.
  return (
    <div className="min-h-full flex flex-col bg-canvas">
      <header className="border-b bg-surface">
        <div className="w-full px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/credit-cases" className="font-semibold tracking-tight">
              Trade Credit App
            </Link>
            <nav className="hidden sm:flex items-center gap-4">
              <NavLink href="/credit-cases" label="Credit Cases" />
              {/* <NavLink href="/credit-cases/new" label="New case" /> */}
              <NavLink href="/customers" label="Customers" />
              <NavLink href="/requirements" label="Requirements" />
              <NavLink href="/labels" label="Custom fields" />
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Every page renders through AppShell, so the header is the one place the
                theme button has to live to be available app-wide. */}
            <ThemeToggle />
            {user ? (
              <>
                <div className="hidden sm:block text-sm text-fg-muted">
                  Signed in as <span className="font-medium">{user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    router.push("/login");
                  }}
                  className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-surface-subtle"
                >
                  Log out
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {pathname !== "/login" && (
                  <Link
                    href="/login"
                    className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-surface-subtle"
                  >
                    Log in
                  </Link>
                )}
                {pathname !== "/signup" && (
                  <Link
                    href="/signup"
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:bg-primary-hover"
                  >
                    Sign up
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="w-full px-4 py-8 sm:px-6 lg:px-8">{props.children}</div>
      </main>
      <footer className="border-t bg-surface">
        <div className="w-full px-4 py-4 sm:px-6 lg:px-8 text-xs text-fg-subtle">
          Dev mode. API base:{" "}
          <span className="font-mono">{process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1"}</span>
        </div>
      </footer>
    </div>
  );
}

