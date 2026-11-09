"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SpeechButton } from "@/components/speech-button";
import { StudyExplanation } from "@/components/study-explanation";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
    dailyGenerationLimit,
    koreanDate,
    studyScenes,
    type StudyDay,
    type StudyExample,
    type StudyHistory,
} from "@/lib/ai-study";

type StudyData = {
    entry: StudyDay | null;
    history: StudyHistory[];
    completed: number[];
    today: string;
    used: number;
};
type Mode = "learn" | "recall" | "talk";
const modes: { value: Mode; label: string }[] = [
    { value: "learn", label: "01 이해하기" },
    { value: "recall", label: "02 떠올리기" },
    { value: "talk", label: "03 대화하기" },
];

export function ConversationStudy() {
    const { user, loading, error } = useAuth();
    if (loading) return <p role="status">로그인 상태를 확인하는 중…</p>;
    if (error)
        return (
            <div className="panel">
                <p role="alert">{error}</p>
                <button
                    className="secondary-button mt-4"
                    onClick={() => window.location.reload()}
                >
                    다시 확인하기
                </button>
            </div>
        );
    if (!user)
        return (
            <section className="panel mx-auto max-w-2xl py-12 text-center">
                <p className="eyebrow">AI CONVERSATION</p>
                <h1 className="mt-4 text-3xl font-bold">
                    나만의 일본어 회화 노트
                </h1>
                <p className="mt-5 leading-8 text-muted">
                    매일 새로운 표현 5개와 핵심 어휘, 예문을 익혀요.
                    <br />
                    로그인하면 배운 내용과 완료 기록을 계정에 보관하고 다른
                    기기에서도 이어 볼 수 있어요.
                </p>
                <Link className="primary-button mt-7" href="/login">
                    로그인하고 시작하기 →
                </Link>
            </section>
        );
    // 계정이 바뀌면 진행 중 요청과 화면 상태를 함께 초기화합니다.
    return <AccountConversation key={user.id} userId={user.id} />;
}

function AccountConversation({ userId }: { userId: string }) {
    const [data, setData] = useState<StudyData | null>(null);
    const [date, setDate] = useState(koreanDate);
    const [today, setToday] = useState(koreanDate);
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [lessonIndex, setLessonIndex] = useState(0);
    const [exampleIndex, setExampleIndex] = useState(0);
    const [mode, setMode] = useState<Mode>("learn");
    const [scene, setScene] = useState<string>(studyScenes[0]);
    const sequence = useRef(0);
    const mutation = useRef(false);

    const call = useCallback(
        async (path: string, body?: Record<string, unknown>) => {
            const { data: session, error } =
                await getSupabaseClient().auth.getSession();
            if (error || !session.session || session.session.user.id !== userId)
                throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
            let response: Response;
            try {
                response = await fetch(path, {
                    method: body ? "POST" : "GET",
                    cache: "no-store",
                    headers: {
                        Authorization: `Bearer ${session.session.access_token}`,
                        ...(body ? { "Content-Type": "application/json" } : {}),
                    },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                    signal: AbortSignal.timeout(body ? 235000 : 30000),
                });
            } catch {
                throw new Error(
                    "서버 응답을 받지 못했어요. 저장됐을 수 있으니 다시 불러온 뒤 확인해 주세요.",
                );
            }
            let result;
            try {
                result = await response.json();
            } catch {
                throw new Error(
                    "서버 응답을 확인하지 못했어요. 다시 불러와 주세요.",
                );
            }
            if (!response.ok)
                throw new Error(result.error ?? "요청을 완료하지 못했어요.");
            return result;
        },
        [userId],
    );

    const load = useCallback(
        async (selectedDate: string) => {
            const current = ++sequence.current;
            setLoading(true);
            setError("");
            setNotice("");
            try {
                const result: StudyData = await call(
                    `/api/ai-study?date=${encodeURIComponent(selectedDate)}`,
                );
                if (current !== sequence.current) return;
                setData(result);
                setToday(result.today);
                setLessonIndex(0);
                setExampleIndex(0);
                setMode("learn");
            } catch (error) {
                if (current === sequence.current)
                    setError(
                        error instanceof Error
                            ? error.message
                            : "자료를 불러오지 못했어요.",
                    );
            } finally {
                if (current === sequence.current) setLoading(false);
            }
        },
        [call],
    );

    useEffect(() => {
        const tracker = sequence;
        const current = ++tracker.current;
        void call(`/api/ai-study?date=${encodeURIComponent(date)}`)
            .then((result: StudyData) => {
                if (tracker.current !== current) return;
                setData(result);
                setToday(result.today);
                setLessonIndex(0);
                setExampleIndex(0);
                setMode("learn");
            })
            .catch((error: unknown) => {
                if (tracker.current === current)
                    setError(
                        error instanceof Error
                            ? error.message
                            : "자료를 불러오지 못했어요.",
                    );
            })
            .finally(() => {
                if (tracker.current === current) setLoading(false);
            });
        return () => {
            if (tracker.current === current) tracker.current++;
        };
    }, [date, call]);

    function chooseDate(value: string) {
        if (value === date) return;
        setLoading(true);
        setError("");
        setNotice("");
        setDate(value);
    }

    useEffect(() => {
        const update = () => setToday(koreanDate());
        const timer = window.setInterval(update, 30000);
        window.addEventListener("focus", update);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", update);
        };
    }, []);

    async function act(action: "generate" | "more" | "complete") {
        if (mutation.current || loading) return;
        mutation.current = true;
        const current = ++sequence.current;
        setPending(action);
        setError("");
        setNotice("");
        try {
            const result = await call("/api/ai-study", {
                action,
                date,
                index: lessonIndex,
                scene,
            });
            if (current !== sequence.current) return;
            // 저장 직후의 결과를 먼저 반영해, 추가 조회가 실패해도 저장 성공을 잃지 않습니다.
            if (action === "complete") {
                setData((previous) =>
                    previous
                        ? {
                              ...previous,
                              completed: [
                                  ...new Set([
                                      ...previous.completed,
                                      lessonIndex,
                                  ]),
                              ],
                          }
                        : previous,
                );
                setNotice("이 표현의 학습 완료를 계정에 저장했어요.");
            } else {
                setData((previous) =>
                    previous
                        ? {
                              ...previous,
                              entry: result.entry,
                              used: previous.used + (result.cached ? 0 : 1),
                          }
                        : previous,
                );
                if (action === "generate") {
                    setLessonIndex(0);
                    setExampleIndex(0);
                    setMode("learn");
                } else setExampleIndex(result.start);
                setNotice(
                    action === "generate"
                        ? "오늘의 표현과 어휘, 예문을 계정에 저장했어요."
                        : "새 예문 4개를 저장했어요.",
                );
            }
            const resultDate = result.entry?.study_date ?? date;
            if (resultDate !== date) {
                chooseDate(resultDate);
                setPending("");
                return;
            }
            try {
                const fresh: StudyData = await call(
                    `/api/ai-study?date=${encodeURIComponent(date)}`,
                );
                if (current === sequence.current) setData(fresh);
            } catch {
                if (current === sequence.current)
                    setError(
                        "저장은 완료됐지만 최신 기록을 불러오지 못했어요. 다시 불러와 주세요.",
                    );
            }
        } catch (error) {
            if (current === sequence.current)
                setError(
                    error instanceof Error
                        ? error.message
                        : "요청을 완료하지 못했어요.",
                );
        } finally {
            mutation.current = false;
            if (current === sequence.current) setPending("");
        }
    }

    const busy = loading || Boolean(pending);
    const entry = data?.entry?.study_date === date ? data.entry : null;
    const lesson = entry?.lessons[lessonIndex];
    const example =
        lesson?.examples[Math.min(exampleIndex, lesson.examples.length - 1)];
    const dates = [
        ...new Set([
            today,
            ...(data?.history.map((item) => item.study_date) ?? []),
            date,
        ]),
    ]
        .sort()
        .reverse();
    const limitReached = (data?.used ?? 0) >= dailyGenerationLimit;

    return (
        <div>
            <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                    <p className="eyebrow">AI CONVERSATION</p>
                    <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
                        매일 한입, 일본어 회화
                    </h1>
                    <p className="mt-4 max-w-2xl leading-7 text-muted">
                        새로운 표현 다섯 개를 이해하고, 떠올리고, 대화로 익혀요.
                        <br className="hidden sm:block" /> 배운 표현과 핵심
                        어휘는 다음 날 새 학습 대상으로 다시 고르지 않아요.
                    </p>
                </div>
                <label className="min-w-52 text-sm font-semibold">
                    학습 기록{" "}
                    <select
                        className="form-input"
                        value={date}
                        disabled={busy}
                        onChange={(event) => chooseDate(event.target.value)}
                    >
                        {dates.map((item) => (
                            <option key={item} value={item}>
                                {item}
                                {item === today ? " · 오늘" : " · 복습"}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-sm">
                <p>
                    <b>{date}</b>
                    <span className="ml-3 text-muted">
                        {date === today
                            ? "오늘의 학습 · 한국 시간 기준"
                            : "저장된 학습 다시 보기"}
                    </span>
                </p>
                <span className="text-muted">
                    {data?.completed.length ?? 0} / 5개 익힘 · 오늘 생성{" "}
                    {data?.used ?? 0} / {dailyGenerationLimit}회
                </span>
            </div>
            <div
                className="mt-4 min-h-7"
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                <p className="text-sm leading-7 text-muted">
                    {pending === "generate"
                        ? "AI가 새 표현과 예문을 만들고 있어요. 잠시 기다려 주세요…"
                        : pending === "more"
                          ? "선택한 상황의 예문 4개를 만들고 있어요…"
                          : pending === "complete"
                            ? "학습 완료를 저장하는 중…"
                            : loading
                              ? "학습 기록을 불러오는 중…"
                              : notice}
                </p>
            </div>
            {error && (
                <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
                    <p role="alert" className="text-sm leading-7">
                        {error}
                    </p>
                    <button
                        className="secondary-button mt-3"
                        disabled={busy}
                        onClick={() => void load(date)}
                    >
                        다시 불러오기
                    </button>
                </div>
            )}

            {!loading && !entry && !error && (
                <section className="panel mt-6 py-12 text-center">
                    <span
                        aria-hidden="true"
                        className="font-japanese text-5xl text-accent"
                    >
                        話
                    </span>
                    <h2 className="mt-6 text-2xl font-bold">
                        {date === today
                            ? "오늘은 어떤 이야기를 해볼까요?"
                            : "이 날짜에는 저장된 학습이 없어요"}
                    </h2>
                    <p className="mx-auto mt-4 max-w-xl leading-8 text-muted">
                        표현 5개 · 핵심 어휘 10개 · 대화 예문 30개
                        <br />
                        만든 자료는 자동 저장되고, 같은 날짜에는 다시 생성하지
                        않아요.
                    </p>
                    {date === today ? (
                        <button
                            className="primary-button mt-7"
                            disabled={busy || limitReached}
                            onClick={() => void act("generate")}
                        >
                            {pending === "generate"
                                ? "오늘의 표현 만드는 중…"
                                : "오늘의 표현 만들기 ✧"}
                        </button>
                    ) : (
                        <button
                            className="primary-button mt-7"
                            disabled={busy}
                            onClick={() => chooseDate(today)}
                        >
                            오늘의 학습으로
                        </button>
                    )}
                    <p className="mt-4 text-xs leading-6 text-muted">
                        새 자료 생성 시 API 사용료가 발생해요. 실패·중복
                        재시도를 포함해 계정별 하루 최대 10회예요.
                    </p>
                </section>
            )}

            {!loading && entry && lesson && example && (
                <div className="mt-5 grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
                    <aside className="panel !p-5">
                        <h2 className="font-bold">
                            {date === today
                                ? "오늘의 다섯 표현"
                                : "이날 배운 표현"}
                        </h2>
                        <nav
                            className="mt-4 flex flex-col gap-2"
                            aria-label="회화 표현 선택"
                        >
                            {entry.lessons.map((item, index) => (
                                <button
                                    key={item.canonical}
                                    type="button"
                                    aria-current={
                                        index === lessonIndex
                                            ? "step"
                                            : undefined
                                    }
                                    disabled={busy}
                                    onClick={() => {
                                        setLessonIndex(index);
                                        setExampleIndex(0);
                                        setMode("learn");
                                        setNotice("");
                                    }}
                                    className={`min-h-16 rounded-xl border p-3 text-left disabled:opacity-50 ${index === lessonIndex ? "border-accent bg-canvas" : "border-line hover:border-accent"}`}
                                >
                                    <span className="text-xs text-accent">
                                        {String(index + 1).padStart(2, "0")}
                                        {data?.completed.includes(index)
                                            ? " · 학습 완료 ✓"
                                            : ""}
                                    </span>
                                    <span
                                        lang="ja"
                                        className="mt-1 block break-words text-sm font-bold"
                                    >
                                        {item.title}
                                    </span>
                                    <span className="mt-1 block text-xs leading-5 text-muted">
                                        {item.meaning}
                                    </span>
                                </button>
                            ))}
                        </nav>
                        <p className="mt-5 text-xs leading-6 text-muted">
                            자료와 완료 기록은 계정에 저장돼요. 복습과 발음
                            듣기는 추가 생성 없이 사용할 수 있어요.
                        </p>
                    </aside>
                    <section className="min-w-0">
                        <p className="text-sm font-semibold text-accent">
                            {lesson.category} · 표현 {lessonIndex + 1} / 5
                        </p>
                        <h2
                            lang="ja"
                            className="mt-3 break-words text-3xl font-bold leading-relaxed"
                        >
                            {lesson.title}
                        </h2>
                        <p className="mt-2 leading-7 text-muted">
                            {lesson.meaning}
                        </p>
                        <div
                            className="mt-6 grid grid-cols-3 gap-2"
                            role="group"
                            aria-label="회화 연습 단계"
                        >
                            {modes.map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    aria-pressed={mode === item.value}
                                    disabled={busy}
                                    onClick={() => setMode(item.value)}
                                    className={`min-h-12 rounded-xl border px-2 py-3 text-xs font-semibold sm:text-sm ${mode === item.value ? "border-accent bg-accent text-surface" : "border-line bg-surface"}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        <ExampleCard
                            key={`${entry.study_date}:${lessonIndex}:${exampleIndex}:${mode}`}
                            example={example}
                            mode={mode}
                        />
                        <div className="mt-4 flex items-center justify-between gap-3">
                            <button
                                className="secondary-button"
                                disabled={busy}
                                aria-label="이전 예문"
                                onClick={() =>
                                    setExampleIndex(
                                        (exampleIndex -
                                            1 +
                                            lesson.examples.length) %
                                            lesson.examples.length,
                                    )
                                }
                            >
                                ← 이전
                            </button>
                            <span className="text-sm text-muted">
                                예문 {exampleIndex + 1} /{" "}
                                {lesson.examples.length}
                            </span>
                            <button
                                className="secondary-button"
                                disabled={busy}
                                aria-label="다음 예문"
                                onClick={() =>
                                    setExampleIndex(
                                        (exampleIndex + 1) %
                                            lesson.examples.length,
                                    )
                                }
                            >
                                다음 →
                            </button>
                        </div>
                        <div className="panel mt-6 !p-5">
                            <h3 className="text-sm font-bold">
                                {mode === "learn"
                                    ? "표현의 원리"
                                    : "자연스럽게 말하는 팁"}
                            </h3>
                            <StudyExplanation
                                text={mode === "learn" ? lesson.rule : lesson.tip}
                            />
                        </div>
                        <section className="mt-6" aria-label="오늘의 핵심 어휘">
                            <h3 className="font-bold">함께 익히는 핵심 어휘</h3>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {lesson.vocabulary.map((word) => (
                                    <div
                                        key={word.term}
                                        className="rounded-2xl border border-line bg-surface p-5"
                                    >
                                        <p
                                            lang="ja"
                                            className="text-lg font-bold"
                                        >
                                            {word.term}
                                        </p>
                                        <p
                                            lang="ja"
                                            className="mt-1 text-sm text-muted"
                                        >
                                            {word.reading}
                                        </p>
                                        <p className="mt-3 text-sm">
                                            {word.meaning}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <div className="panel mt-6 !p-5">
                            <label
                                htmlFor="conversation-scene"
                                className="text-sm font-bold"
                            >
                                같은 표현으로 더 연습하기
                            </label>
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                                <select
                                    id="conversation-scene"
                                    className="form-input !mt-0 flex-1"
                                    value={scene}
                                    disabled={busy}
                                    onChange={(event) =>
                                        setScene(event.target.value)
                                    }
                                >
                                    {studyScenes.map((item) => (
                                        <option key={item}>{item}</option>
                                    ))}
                                </select>
                                <button
                                    className="secondary-button shrink-0"
                                    disabled={
                                        busy ||
                                        limitReached ||
                                        lesson.examples.length + 4 > 30
                                    }
                                    onClick={() => void act("more")}
                                >
                                    ✧ 예문 4개 더 만들기
                                </button>
                            </div>
                            <p className="mt-3 text-xs leading-6 text-muted">
                                추가 생성 시 API 사용료가 발생해요. 표현마다
                                최대 30개까지 저장할 수 있어요.
                            </p>
                        </div>
                        <div className="mt-6 flex flex-wrap justify-between gap-3">
                            <button
                                className="secondary-button"
                                disabled={busy}
                                onClick={() => {
                                    setExampleIndex(0);
                                    setMode("learn");
                                }}
                            >
                                ↻ 처음부터 반복
                            </button>
                            <button
                                className="primary-button"
                                disabled={
                                    busy ||
                                    data?.completed.includes(lessonIndex)
                                }
                                onClick={() => void act("complete")}
                            >
                                {data?.completed.includes(lessonIndex)
                                    ? "학습 완료 ✓"
                                    : "이 표현 익혔어요 ✓"}
                            </button>
                        </div>
                        <p className="mt-5 text-xs leading-6 text-muted">
                            AI가 생성한 자료에는 오류가 있을 수 있어요. 중복
                            방지는 새 학습 대상 표현·어휘에 적용되며, 예문에는
                            익숙한 단어가 다시 쓰일 수 있어요.
                        </p>
                    </section>
                </div>
            )}
        </div>
    );
}

function ExampleCard({ example, mode }: { example: StudyExample; mode: Mode }) {
    const [revealed, setRevealed] = useState(false);
    const showJapanese = mode !== "recall" || revealed;
    const showReply = mode !== "talk" || revealed;
    return (
        <article className="mt-4 rounded-3xl bg-card p-6 text-white sm:p-8">
            <p className="text-xs font-semibold tracking-wide text-card-muted">
                {mode === "learn"
                    ? "읽고 소리 내어 말해보세요"
                    : mode === "recall"
                      ? "한국어를 보고 일본어로 말해보세요"
                      : "상대방의 대답을 떠올려보세요"}
            </p>
            {mode === "recall" && (
                <p className="mt-7 text-xl font-semibold leading-9">
                    {example.ko}
                </p>
            )}
            {showJapanese ? (
                <>
                    <p
                        lang="ja"
                        className="mt-7 break-words text-2xl font-semibold leading-relaxed sm:text-3xl"
                    >
                        {example.jp}
                    </p>
                    <p lang="ja" className="mt-4 leading-8 text-card-muted">
                        {example.reading}
                    </p>
                    {mode !== "recall" && (
                        <p className="mt-3 leading-8 text-card-muted">
                            {example.ko}
                        </p>
                    )}
                    <SpeechButton text={example.jp} label="예문 듣기" />
                </>
            ) : (
                <button
                    className="mt-7 min-h-12 rounded-xl border border-white/30 px-5 py-3"
                    onClick={() => setRevealed(true)}
                >
                    일본어 답 확인하기
                </button>
            )}
            {showJapanese && (
                <div className="mt-7 border-t border-white/20 pt-5">
                    <p className="text-xs font-bold text-card-muted">
                        상대방의 대답
                    </p>
                    {showReply ? (
                        <>
                            <p lang="ja" className="mt-3 text-lg leading-8">
                                {example.reply}
                            </p>
                            <p className="mt-2 text-sm leading-7 text-card-muted">
                                {example.replyKo}
                            </p>
                            <SpeechButton
                                text={example.reply}
                                label="대답 듣기"
                            />
                        </>
                    ) : (
                        <button
                            className="mt-4 min-h-12 rounded-xl border border-white/30 px-5 py-3"
                            onClick={() => setRevealed(true)}
                        >
                            대답 확인하기
                        </button>
                    )}
                </div>
            )}
        </article>
    );
}
