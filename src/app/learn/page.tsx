import { AppShell } from "@/components/layout/app-shell";
import { DayCards } from "@/components/day-cards";

export default function Page() {
  return (
    <AppShell>
      <p className="eyebrow">DAILY PRACTICE</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">오늘은 어떤 Day를 배워볼까요?</h1>
      <p className="mt-4 leading-7 text-muted">하루 50개씩, 총 20일의 일본어 단어 학습. 원하는 카드를 선택해 시작하세요.</p>
      <DayCards />
    </AppShell>
  );
}
