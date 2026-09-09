export function WordPreview() {
  return (
    <section
      aria-labelledby="word-preview-title"
      className="flex min-w-0 flex-col rounded-3xl bg-card p-6 text-white sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="word-preview-title" className="text-sm font-medium text-card-muted">
          단어 카드 미리보기
        </h2>
        <span className="rounded-full border border-white/25 px-3 py-1 text-xs text-card-muted">
          예시
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-12 sm:py-14">
        <p lang="ja" className="font-japanese text-[clamp(4rem,14vw,6.5rem)] leading-tight tracking-[0.12em] indent-[0.12em]">
          言葉
        </p>
        <p lang="ja" className="mt-4 text-xl tracking-[0.25em] indent-[0.25em] text-card-muted">
          ことば
        </p>
        <p className="mt-2 text-sm tracking-[0.15em] text-card-muted">kotoba</p>
        <div aria-hidden="true" className="my-6 h-px w-8 bg-white/30" />
        <p className="text-2xl font-medium tracking-tight">말, 언어</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-5 text-sm text-card-muted">
        <span>작은 단어에서 시작하는 일본어</span>
        <span><span lang="ja">名詞</span> · 명사</span>
      </div>
    </section>
  );
}
