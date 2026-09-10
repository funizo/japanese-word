import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
import { days } from "@/lib/words";

export default function Page() {
  return (
    <AppShell>
      <p className="eyebrow">DAILY PRACTICE</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">오늘은 어떤 Day를 배워볼까요?</h1>
      <p className="mt-4 leading-7 text-muted">하루 50개씩, 총 20일의 일본어 단어 학습. 원하는 카드를 선택해 시작하세요.</p>
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {days.map((day, index) => (
          <Link key={day.id} href={`/learn/${day.id}`} className="panel group min-w-0 transition-colors hover:border-accent">
            <p className="text-sm font-semibold text-accent">{index + 1}일차</p>
            <h2 className="mt-3 text-2xl font-bold">{day.label}</h2>
            <p className="mt-3 text-sm text-muted">단어 {day.words.length}개</p>
            <p lang="ja" className="mt-4 truncate text-sm text-muted">{day.words.slice(0, 3).map((word) => word.text).join(" · ")}</p>
            <p className="mt-6 text-sm font-semibold text-accent">학습 시작 <span aria-hidden="true">→</span></p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
