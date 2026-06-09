"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  apiJson,
  clearStoredTokens,
  getStoredTokens,
  getUserIdFromAccessToken,
  setStoredTokens,
} from "./api";
import type { TokenObtainPair, User } from "./types";

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (args: { email: string; password: string }) => Promise<void>;
  signup: (args: { email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchCurrentUser(accessToken: string): Promise<User> {
  const userId = getUserIdFromAccessToken(accessToken);
  if (!userId) {
    throw new Error("Invalid access token");
  }
  return apiJson<User>({ pathOrUrl: `/users/${userId}/` });
}

async function loginWithCredentials(args: {
  email: string;
  password: string;
}): Promise<{ tokens: { access: string; refresh: string }; user: User }> {
  const tokens = await apiJson<TokenObtainPair>({
    pathOrUrl: "/auth/login/",
    method: "POST",
    body: { email: args.email, password: args.password },
    auth: false,
  });
  setStoredTokens({ access: tokens.access, refresh: tokens.refresh });
  const user = await fetchCurrentUser(tokens.access);
  return { tokens, user };
}

export function AuthProvider(props: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const { access } = getStoredTokens();
      if (!access) return;

      try {
        const currentUser = await fetchCurrentUser(access);
        if (!cancelled) setUser(currentUser);
      } catch {
        clearStoredTokens();
      }
    }

    restoreSession().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    return {
      user,
      loading,
      async login(args) {
        const { user: loggedInUser } = await loginWithCredentials(args);
        setUser(loggedInUser);
      },
      async signup(args) {
        await apiJson<User>({
          pathOrUrl: "/users/",
          method: "POST",
          body: { email: args.email, password: args.password },
          auth: false,
        });
        const { user: loggedInUser } = await loginWithCredentials(args);
        setUser(loggedInUser);
      },
      logout() {
        setUser(null);
        clearStoredTokens();
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
