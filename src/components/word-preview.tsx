import { WordStudy } from "@/components/word-study";

export function WordPreview() {
  return (
    <section aria-labelledby="word-preview-title" className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="word-preview-title" className="text-base font-semibold">
          단어 카드 미리 체험하기
        </h2>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        카드를 좌우로 밀어보세요. 같은 단어로 반복 체험할 수 있으며, 실제 단어장에는 저장되지 않아요.
      </p>
      <WordStudy preview />
    </section>
  );
}
