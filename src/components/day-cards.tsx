"use client";

import Link from "next/link";
import { days } from "@/lib/words";
import { useStudyProgress } from "@/lib/use-study-progress";

export function DayCards() {
  const { completedDays, ready, error, reload } = useStudyProgress();

  return (
    <>
      <p role="status" className="mt-4 text-sm text-muted">
        {error || (!ready ? "학습 기록을 불러오는 중…" : "")}
      </p>
      {error && <button className="secondary-button mt-2" onClick={reload}>다시 불러오기</button>}
      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {days.map((day, index) => {
          const completed = completedDays.includes(day.id);
          return (
            <Link key={day.id} href={`/learn/${day.id}`} className={`panel group relative min-w-0 transition-colors ${completed ? "border-green-300 bg-green-50 hover:border-green-600 dark:border-green-800 dark:bg-green-950" : "hover:border-accent"}`}>
              {completed && (
                <span className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full bg-green-700 text-white sm:right-4 sm:top-4">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="m5 12 4 4 10-10" /></svg>
                  <span className="sr-only">학습 완료</span>
                </span>
              )}
              <p className={`pr-4 text-sm font-semibold ${completed ? "text-green-800 dark:text-green-300" : "text-accent"}`}>{index + 1}일차</p>
              <h2 className="mt-3 text-2xl font-bold">{day.label}</h2>
              <p className="mt-3 text-sm text-muted">단어 {day.words.length}개</p>
              <p lang="ja" className="mt-4 truncate text-sm text-muted">{day.words.slice(0, 3).map((word) => word.text).join(" · ")}</p>
              <p className={`mt-6 text-sm font-semibold ${completed ? "text-green-800 dark:text-green-300" : "text-accent"}`}>{completed ? "다시 학습" : "학습 시작"} <span aria-hidden="true">→</span></p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
