import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** 인증과 단어장 저장에 사용하는 브라우저 전용 클라이언트입니다. */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    throw new Error("이 Supabase 클라이언트는 브라우저에서만 사용해 주세요.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      ".env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY를 설정해 주세요.",
    );
  }

  browserClient ??= createClient<Database>(url, publishableKey);
  return browserClient;
}
