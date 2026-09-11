"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";

type AuthState = { user: User | null; loading: boolean; error: string };
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null, loading: isSupabaseConfigured(), error: "",
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    async function initialize() {
      try {
        const client = getSupabaseClient();
        let receivedEvent = false;
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          // 인증 콜백 안에서는 다른 Supabase 요청을 기다리지 않습니다.
          receivedEvent = true;
          if (active) setState({ user: session?.user ?? null, loading: false, error: "" });
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const { data: sessionData, error } = await client.auth.getSession();
        if (error) throw error;
        if (active && !receivedEvent) {
          setState({ user: sessionData.session?.user ?? null, loading: false, error: "" });
        }
      } catch {
        if (active) setState({ user: null, loading: false, error: "로그인 상태를 확인하지 못했어요. 새로고침 후 다시 시도해 주세요." });
      }
    }
    void initialize();
    return () => { active = false; unsubscribe?.(); };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const state = useContext(AuthContext);
  if (!state) throw new Error("AuthProvider 안에서 사용해 주세요.");
  return state;
}
