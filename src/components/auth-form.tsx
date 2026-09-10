"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const auth = getSupabaseClient().auth;
      const credentials = { email: String(form.get("email")).trim(), password: String(form.get("password")) };
      const { data, error } = signup ? await auth.signUp(credentials) : await auth.signInWithPassword(credentials);
      if (error) {
        setMessage(
          signup
            ? "회원가입에 실패했어요. 입력 정보와 이메일을 확인해 주세요."
            : "로그인에 실패했어요. 이메일과 비밀번호를 확인해 주세요.",
        );
        return;
      }
      if (data.session) {
        router.push("/learn");
        return;
      }
      setMessage("이메일로 보낸 인증 링크를 확인한 후 로그인해 주세요.");
    } catch {
      setMessage("인증 서비스에 연결할 수 없어요. Supabase 설정 또는 네트워크를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel mx-auto max-w-md">
      <p className="eyebrow">나의 작은 일본어 노트</p>
      <h1 className="mt-3 text-3xl font-bold">{signup ? "회원가입" : "다시 만나 반가워요"}</h1>
      <p className="mt-3 leading-7 text-muted">
        {signup ? "새로운 일본어 습관을 함께 시작해요." : "로그인하고 오늘의 학습을 시작해요."}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block text-sm font-medium">
          이메일
          <input
            className="form-input"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="hello@example.com"
            required
          />
        </label>
        <label className="block text-sm font-medium">
          비밀번호
          <input
            className="form-input"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            placeholder={signup ? "8자 이상 입력해 주세요" : "비밀번호를 입력해 주세요"}
            required
          />
        </label>
        <button className="primary-button w-full" disabled={busy}>
          {busy ? "처리 중…" : signup ? "가입하기" : "로그인"}
        </button>
        <p role="status" className="text-sm leading-6 text-muted">
          {message}
        </p>
      </form>
      <p className="mt-6 border-t border-line pt-6 text-center text-sm text-muted">
        {signup ? "이미 계정이 있나요?" : "아직 계정이 없나요?"}{" "}
        <Link className="font-semibold text-accent" href={signup ? "/login" : "/signup"}>
          {signup ? "로그인" : "회원가입"}
        </Link>
      </p>
    </section>
  );
}
