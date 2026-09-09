import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | undefined;

/** 데이터 기능을 추가할 때 브라우저에서 호출하는 Supabase 클라이언트입니다. */
export function getSupabaseClient(): SupabaseClient {
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

  browserClient ??= createClient(url, publishableKey);
  return browserClient;
}
