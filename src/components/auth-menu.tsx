"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { getSupabaseClient } from "@/lib/supabase/client";

export function AuthMenu() {
  const { user, loading, error } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function signOut() {
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      setMessage("로그아웃하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto">
      {loading ? <span className="text-muted">로그인 확인 중…</span> : user ? (
        <>
          <span className="max-w-48 truncate text-muted" title={user.email}>{user.email}</span>
          <button className="nav-link" disabled={busy} onClick={signOut}>{busy ? "로그아웃 중…" : "로그아웃"}</button>
        </>
      ) : (
        <>
          <Link className="nav-link" href="/login">로그인</Link>
          <Link className="nav-link text-accent" href="/signup">회원가입</Link>
        </>
      )}
      {(error || message) && <p role="status" className="w-full text-xs text-muted">{error || message}</p>}
    </div>
  );
}
