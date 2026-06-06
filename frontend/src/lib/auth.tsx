"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import { apiJson, drfListAll } from "./api";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  safeJsonParse,
  setLocalStorageItem,
} from "./storage";

const AUTH_KEY = "tca.currentUser";

export type User = {
  url: string;
  id: number;
  email: string;
  date_joined: string;
  organizations: string[];
};

type AuthState = {
  user: User | null;
  loading: boolean;
  loginByEmail: (email: string) => Promise<void>;
  signup: (args: { email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    safeJsonParse<User>(getLocalStorageItem(AUTH_KEY)),
  );
  const [loading] = useState(false);

  const value = useMemo<AuthState>(() => {
    return {
      user,
      loading,
      async loginByEmail(email: string) {
        const allUsers = await drfListAll<User>({ path: "/users/" });
        const found =
          allUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ||
          null;
        if (!found) {
          throw new Error("No user found with that email. Try signing up first.");
        }
        setUser(found);
        setLocalStorageItem(AUTH_KEY, JSON.stringify(found));
      },
      async signup(args: { email: string; password: string }) {
        const created = await apiJson<User>({
          pathOrUrl: "/users/",
          method: "POST",
          body: { email: args.email, password: args.password },
        });
        setUser(created);
        setLocalStorageItem(AUTH_KEY, JSON.stringify(created));
      },
      logout() {
        setUser(null);
        removeLocalStorageItem(AUTH_KEY);
      },
    };
  }, [user, loading]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useRequireAuth(): { user: User } {
  const { user, loading } = useAuth();
  if (loading) {
    throw new Error("Auth is still loading");
  }
  if (!user) {
    throw new Error("Not authenticated");
  }
  return { user };
}

