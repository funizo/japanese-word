import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthMenu } from "@/components/auth-menu";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main-content"
        className="sr-only fixed top-4 left-4 z-50 rounded-xl bg-surface px-5 py-3 font-semibold focus:not-sr-only"
      >
        본문으로 건너뛰기
      </a>

      <header className="border-b border-line bg-surface pt-[env(safe-area-inset-top)]">
        <div className="safe-area mx-auto flex min-h-20 w-full max-w-6xl flex-wrap items-center justify-between gap-4 py-3">
          <Link href="/" aria-label="japanese-word 홈" className="flex min-h-11 items-center gap-3 rounded-lg">
            <span
              aria-hidden="true"
              lang="ja"
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent font-japanese text-2xl text-surface"
            >
              言
            </span>
            <span className="text-lg font-bold tracking-tight sm:text-xl">주분주분</span>
          </Link>
          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden text-sm text-muted md:block">일상에 일본어 한 조각</span>
            <ThemeToggle />
          </div>
          <nav
            aria-label="메인 메뉴"
            className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-sm font-medium"
          >
            <Link className="nav-link" href="/">
              서비스 소개
            </Link>
            <Link className="nav-link" href="/learn">
              단어 학습
            </Link>
            <Link className="nav-link" href="/saved">
              내 단어장
            </Link>
            <AuthMenu />
          </nav>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="safe-area mx-auto w-full max-w-6xl flex-1 py-10 outline-none sm:py-14 lg:py-16"
      >
        {children}
      </main>

      <footer className="safe-area mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-xs leading-6 text-muted">
        <span className="font-semibold tracking-tight">japanese-word</span>
        <span>나의 작은 일본어 노트</span>
      </footer>
    </div>
  );
}
