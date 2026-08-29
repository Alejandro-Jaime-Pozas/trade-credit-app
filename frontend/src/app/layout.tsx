/**
 * Root layout — wraps every page in the Next.js App Router.
 *
 * Runs once for the whole app: sets fonts, global CSS, the light/dark theme, and
 * `<AuthProvider>` so login state is available everywhere. This is a Server Component
 * (no `"use client"`); interactive auth logic lives in `lib/auth.tsx`.
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Trade Credit App",
  description: "Trade credit case intake and tracking (dev)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` is required here and only here: the theme script below
    // adds a `dark` class to <html> before React hydrates, so the server-rendered markup
    // and the live DOM legitimately differ on this one element.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/*
          A plain inline <script>, not `next/script`, and deliberately the first thing in
          <head>: it must run BEFORE the browser paints, otherwise a dark-mode user sees a
          white page flash while the app loads. `next/script`'s inline strategies all run
          later than that. See `lib/theme.ts` for what the script does.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
