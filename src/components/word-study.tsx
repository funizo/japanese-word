"use client";
import Link from "next/link";
import { useId, useRef, useState, type PointerEvent } from "react";
import { days, previewWord, swipeFeedback, words } from "@/lib/words";
import { SpeechButton } from "@/components/speech-button";
import { useSavedWords } from "@/lib/use-saved-words";
export function WordStudy({ savedOnly = false, preview = false, dayIndex = 0 }: { savedOnly?: boolean; preview?: boolean; dayIndex?: number }) {
  const swipeHelpId = useId();
  const { saved, ready, busy, error, account, updateSaved, importLocal, reload } = useSavedWords(!preview);
  const [index, setIndex] = useState(0);
  const [drag, setDrag] = useState({ distance: 0, width: 1 });
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const pointer = useRef<{ id: number; x: number; width: number } | null>(null);
  const deciding = useRef(false);
  const day = days[dayIndex];
  const word = preview ? previewWord : day.words[index];
  async function decide(action: string) {
    if (deciding.current || busy || !word) return;
    if (preview) {
      setNotice(
        action === "save" ? "저장 동작을 체험했어요. 실제로 저장되지는 않아요." : "아는 단어로 넘기기를 체험했어요.",
      );
      resetDrag();
      return;
    }
    deciding.current = true;
    resetDrag();
    try {
      if (action === "save" && (!ready || !await updateSaved(word.id))) return;
      setNotice(
        action === "save" ? `${word.text}을(를) 단어장에 저장했어요.` : `${word.text}은(는) 아는 단어로 넘겼어요.`,
      );
      setIndex((current) => current + 1);
    } finally {
      deciding.current = false;
    }
  }
  function resetDrag() {
    pointer.current = null;
    setDragging(false);
    setDrag({ distance: 0, width: 1 });
  }
  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    if (!start || start.id !== event.pointerId) return;
    const { action } = swipeFeedback(event.clientX - start.x, start.width);
    if (action) decide(action);
    else resetDrag();
  }
  const feedback = swipeFeedback(drag.distance, drag.width);
  return (
    <>
      {!preview && (
        <>
          <p className="eyebrow">{savedOnly ? "MY WORDS" : "DAILY PRACTICE"}</p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{savedOnly ? "내 단어장" : `${day.label} · 오늘도 한 단어씩`}</h1>
          <p className="mt-4 text-muted">
            {savedOnly
              ? account
                ? "저장한 단어를 다시 만나보세요. 같은 계정으로 로그인하면 다른 기기에서도 볼 수 있어요."
                : "단어장은 현재 브라우저에 저장돼요. 로그인하면 계정 단어장을 사용할 수 있어요."
              : "카드를 왼쪽으로 밀면 아는 단어, 오른쪽으로 밀면 외우고 싶은 단어로 저장돼요."}
          </p>
        </>
      )}
      {!preview && !savedOnly && (
        <Link className="secondary-button mt-6" href="/learn">← Day 목록으로</Link>
      )}
      <p role="status" className="mt-4 min-h-5 text-sm text-muted">
        {error || (busy ? "단어장을 저장하는 중…" : notice)}
      </p>
      {!preview && error && <button className="secondary-button mt-2" onClick={reload}>다시 불러오기</button>}
      {savedOnly && account && (
        <button className="secondary-button mt-2" disabled={!ready || busy} onClick={async () => {
          setNotice("");
          if (await importLocal()) setNotice("이 브라우저의 단어를 계정 단어장에 추가했어요. 기존 브라우저 단어장도 유지돼요.");
        }}>이 브라우저의 단어 가져오기</button>
      )}
      {savedOnly ? (
        <section className="mt-6" aria-label="저장한 단어">
          {!ready ? (
            <p>{error ? "단어장을 불러올 수 없어요." : "단어장을 불러오는 중…"}</p>
          ) : saved.length === 0 ? (
            <div className="panel py-16 text-center">
              <p className="text-2xl font-semibold">아직 비어 있는 노트</p>
              <p className="mt-3 text-muted">학습하며 기억하고 싶은 단어를 담아보세요.</p>
              <Link className="primary-button mt-6" href="/learn">
                단어 담으러 가기 →
              </Link>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted">저장한 단어 {saved.length}개</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {words
                  .filter((item) => saved.includes(item.id))
                  .map((item) => (
                    <article className="panel" key={item.id}>
                      <p className="mb-3 text-xs font-semibold uppercase text-muted">{item.day}</p>
                      <p lang="ja" className="break-words font-japanese text-4xl">
                        {item.text}
                      </p>
                      <p lang="ja" className="mt-3 text-muted">
                        {item.reading}
                      </p>
                      <p className="mt-4 text-xl font-semibold">{item.meaning}</p>
                      <SpeechButton text={item.reading} label="단어 듣기" />
                      {item.example && (
                        <div className="mt-5 border-t border-line pt-4">
                          <p className="mb-2 text-xs font-semibold text-muted">예문</p>
                          <p lang="ja" className="break-words leading-7">
                            {item.example}
                          </p>
                          <p className="mt-2 break-words text-sm leading-6 text-muted">{item.translation}</p>
                          <SpeechButton text={item.example} label="예문 듣기" />
                        </div>
                      )}
                      <button
                        className="secondary-button mt-6"
                        disabled={!ready || busy}
                        onClick={() => updateSaved(item.id, true)}
                        aria-label={`${item.text} 저장 해제`}
                      >
                        저장 해제
                      </button>
                    </article>
                  ))}
              </div>
            </>
          )}
        </section>
      ) : !word ? (
        <section className="panel mx-auto mt-10 max-w-2xl text-center">
          <h2 className="text-2xl font-bold">
            {day.label} 단어 {day.words.length}개를 모두 확인했어요!
          </h2>
          <p className="mt-4 text-muted">외우고 싶은 단어는 내 단어장에서 다시 볼 수 있어요.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {dayIndex < days.length - 1 && (
              <Link className="primary-button" href={`/learn/${days[dayIndex + 1].id}`}>
                다음 Day 학습하기 →
              </Link>
            )}
            <Link className="primary-button" href="/saved">
              내 단어장 보기
            </Link>
            <button
              className="secondary-button"
              onClick={() => {
                setIndex(0);
                setNotice("");
              }}
            >
              다시 학습하기
            </button>
          </div>
        </section>
      ) : (
        <section
          className={`mx-auto flex max-w-2xl flex-col justify-center px-1 py-6 ${preview ? "" : "min-h-[60svh]"}`}
          aria-label="단어 카드"
        >
          <p id={swipeHelpId} className="mb-4 text-center text-sm text-muted">
            ← 아는 단어 · 외우고 싶은 단어 →
          </p>
          <div
            className="touch-pan-y cursor-grab select-none rounded-3xl bg-card p-8 text-center text-white transition-[transform,opacity,background-color] duration-200 ease-out active:cursor-grabbing sm:p-12 motion-reduce:transition-none"
            style={{
              transform: `translateX(${drag.distance}px)`,
              opacity: feedback.opacity,
              backgroundColor: feedback.backgroundColor,
              transition: dragging ? "none" : undefined,
            }}
            aria-describedby={swipeHelpId}
            onPointerDown={(event) => {
              if (busy || deciding.current || !event.isPrimary || event.button !== 0 || pointer.current) return;
              pointer.current = { id: event.pointerId, x: event.clientX, width: event.currentTarget.offsetWidth };
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragging(true);
            }}
            onPointerMove={(event) => {
              const start = pointer.current;
              if (start?.id === event.pointerId) setDrag({ distance: event.clientX - start.x, width: start.width });
            }}
            onPointerUp={finishDrag}
            onPointerCancel={resetDrag}
            onLostPointerCapture={() => {
              if (pointer.current) resetDrag();
            }}
          >
            <p className="text-sm text-card-muted">
              {preview ? "미리보기 · 1 / 1" : `${day.label} · ${index + 1} / ${day.words.length}`}
            </p>
            <p lang="ja" className="mt-12 break-words font-japanese text-[clamp(2.5rem,7vw,5rem)]">
              {word.text}
            </p>
            <p lang="ja" className="mt-6 break-words text-xl tracking-widest text-card-muted">
              {word.reading}
            </p>
            <SpeechButton text={word.reading} label="단어 듣기" />
            <p className="mt-8 mb-6 text-2xl font-semibold">{word.meaning}</p>
            {word.example && (
              <div className="border-t border-white/20 pt-6">
                <p className="mb-3 text-xs font-semibold text-card-muted">예문</p>
                <p lang="ja" className="break-words text-lg leading-8">
                  {word.example}
                </p>
                <p className="mt-2 break-words text-sm leading-7 text-card-muted">{word.translation}</p>
                <SpeechButton text={word.example} label="예문 듣기" />
              </div>
            )}
          </div>
          <div className="mt-5 flex flex-wrap justify-between gap-3">
            <button className="secondary-button" disabled={busy} onClick={() => decide("known")}>
              ← 알고있어요
            </button>
            <button className="primary-button" disabled={!preview && (!ready || busy)} onClick={() => decide("save")}>
              몰랐어요 →
            </button>
          </div>
        </section>
      )}
    </>
  );
}
