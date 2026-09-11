"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { authErrorMessage, validateSignupPassword } from "@/lib/auth";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const messageId = useId();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const pending = useRef(false);

  useEffect(() => {
    if (!loading && user) router.replace("/learn");
  }, [user, loading, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get("email")).trim(), password: String(form.get("password")) };
    if (signup) {
      const validation = validateSignupPassword(credentials.password, String(form.get("passwordConfirmation")));
      if (validation) { setMessage(validation); return; }
    }
    pending.current = true;
    setBusy(true);
    setMessage("");
    setConfirmationEmail("");
    try {
      const auth = getSupabaseClient().auth;
      const { data, error } = signup
        ? await auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}/login` } })
        : await auth.signInWithPassword(credentials);
      if (error) {
        setMessage(authErrorMessage(error.code));
        if (error.code === "email_not_confirmed") setConfirmationEmail(credentials.email);
        return;
      }
      if (data.session) {
        router.replace("/learn");
        return;
      }
      setConfirmationEmail(credentials.email);
      setMessage("이메일의 인증 링크를 확인해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요. 이미 가입했다면 로그인할 수 있어요.");
    } catch {
      setMessage("인증 서비스에 연결할 수 없어요. Supabase 설정 또는 네트워크를 확인해 주세요.");
    } finally {
      setBusy(false);
      pending.current = false;
    }
  }

  async function resend() {
    if (pending.current || !confirmationEmail) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await getSupabaseClient().auth.resend({
        type: "signup", email: confirmationEmail,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      setMessage(error ? authErrorMessage(error.code) : "인증이 필요한 계정이면 메일이 발송돼요. 받은편지함과 스팸함을 확인해 주세요.");
    } catch {
      setMessage("메일을 요청하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (loading || user) {
    return <section className="panel mx-auto max-w-md"><p role="status">{user ? "학습 화면으로 이동하는 중…" : "로그인 상태를 확인하는 중…"}</p></section>;
  }
  return (
    <section className="panel mx-auto max-w-md">
      <p className="eyebrow">나의 작은 일본어 노트</p>
      <h1 className="mt-3 text-3xl font-bold">{signup ? "회원가입" : "다시 만나 반가워요"}</h1>
      <p className="mt-3 leading-7 text-muted">
        {signup ? "새로운 일본어 습관을 함께 시작해요." : "로그인하고 오늘의 학습을 시작해요."}
      </p>
      <form onSubmit={submit} className="mt-8 space-y-5" aria-describedby={messageId} aria-busy={busy}>
        <fieldset disabled={busy} className="space-y-5">
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
            type={showPassword ? "text" : "password"}
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            placeholder={signup ? "8자 이상 입력해 주세요" : "비밀번호를 입력해 주세요"}
            required
          />
        </label>
        {signup && (
          <label className="block text-sm font-medium">
            비밀번호 확인
            <input className="form-input" name="passwordConfirmation" type={showPassword ? "text" : "password"}
              autoComplete="new-password" placeholder="비밀번호를 한 번 더 입력해 주세요" required />
          </label>
        )}
        <button type="button" className="text-sm font-medium text-accent" aria-pressed={showPassword}
          onClick={() => setShowPassword((current) => !current)}>{showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}</button>
        <button className="primary-button w-full" disabled={busy}>
          {busy ? "처리 중…" : signup ? "가입하기" : "로그인"}
        </button>
        </fieldset>
        <p id={messageId} role="status" aria-live="polite" className="text-sm leading-6 text-muted">
          {message}
        </p>
      </form>
      {confirmationEmail && (
        <div className="mt-5 rounded-xl border border-line p-4">
          <p className="break-all text-sm text-muted">인증 메일 받을 주소: {confirmationEmail}</p>
          <button type="button" className="secondary-button mt-3" disabled={busy} onClick={resend}>
            {busy ? "처리 중…" : "인증 메일 다시 보내기"}
          </button>
        </div>
      )}
      <p className="mt-6 border-t border-line pt-6 text-center text-sm text-muted">
        {signup ? "이미 계정이 있나요?" : "아직 계정이 없나요?"}{" "}
        <Link className="font-semibold text-accent" href={signup ? "/login" : "/signup"}>
          {signup ? "로그인" : "회원가입"}
        </Link>
      </p>
    </section>
  );
}
