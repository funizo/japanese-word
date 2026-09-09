import { AppShell } from "@/components/layout/app-shell";
import { WordPreview } from "@/components/word-preview";

export default function Home() {
  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 text-sm font-semibold tracking-wide text-accent">
            나만의 작은 배움
          </p>
          <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            나의 일본어 노트<span className="text-accent">.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            한 단어씩, 천천히 쌓아가요.
          </p>
        </div>
        <span className="w-fit rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-muted">
          첫 페이지
        </span>
      </div>

      <div className="grid items-stretch gap-5 lg:grid-cols-[1.3fr_1fr] lg:gap-7">
        <WordPreview />
        <section
          aria-labelledby="workspace-title"
          className="flex min-w-0 flex-col rounded-3xl border border-line bg-surface p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="workspace-title" className="text-base font-semibold">
              나의 학습 공간
            </h2>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-muted">
              준비 중
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center py-14 text-center sm:py-16">
            <div className="mb-6 flex size-16 items-center justify-center rounded-2xl border border-line bg-canvas text-accent">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                <path d="M9 7h6M9 11h4" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              아직 비어 있는 노트
            </h3>
            <p className="mt-3 max-w-64 text-base leading-7 text-muted">
              앞으로 배울 단어들이
              <br />
              이곳에 차곡차곡 모일 거예요.
            </p>
          </div>
          <p className="border-t border-line pt-5 text-center text-sm leading-6 text-muted">
            새로운 배움을 위한 공간을 준비하고 있어요.
          </p>
        </section>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-sm text-muted sm:mt-10">
        <p>나의 속도로, 꾸준히.</p>
        <p lang="ja" className="font-japanese tracking-widest">
          一歩ずつ
        </p>
      </div>
    </AppShell>
  );
}
