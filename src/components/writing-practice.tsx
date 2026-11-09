"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SpeechButton } from "@/components/speech-button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { koreanDate } from "@/lib/ai-study";
import { writingGradeLimit, type WritingGrade, type WritingSnapshot } from "@/lib/writing";

function answerTexts(data: WritingSnapshot) {
    return Array.from({ length: 10 }, (_, index) => data.answers.find((answer) => answer.question_index === index)?.answer ?? "");
}

export function WritingPractice() {
    const { user, loading, error } = useAuth();
    if (loading) return <p role="status">로그인 상태를 확인하는 중…</p>;
    if (error) return <section className="panel"><p role="alert">{error}</p><button className="secondary-button mt-4" onClick={() => window.location.reload()}>다시 확인하기</button></section>;
    if (!user) return (
        <section className="panel mx-auto max-w-2xl py-12 text-center">
            <p className="eyebrow">N3 WRITING PRACTICE</p>
            <h1 className="mt-4 text-3xl font-bold">내 말로 쓰는 일본어, 하루 10문장</h1>
            <p className="mt-5 leading-8 text-muted">한국어 문장을 일본어로 바꾸어 써보세요.<br />모두가 같은 문제로 연습하고, 나의 답안과 채점·풀이는 계정에 보관해요.</p>
            <Link className="primary-button mt-7" href="/login">로그인하고 작문 시작하기 →</Link>
        </section>
    );
    return <AccountWriting key={user.id} userId={user.id} />;
}

function AccountWriting({ userId }: { userId: string }) {
    const [date, setDate] = useState(koreanDate);
    const [today, setToday] = useState(koreanDate);
    const [data, setData] = useState<WritingSnapshot | null>(null);
    const [drafts, setDrafts] = useState<string[]>(Array(10).fill(""));
    const [loading, setLoading] = useState(true);
    const [pending, setPending] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const sequence = useRef(0);
    const acting = useRef(false);

    const call = useCallback(async (selectedDate: string, body?: Record<string, unknown>): Promise<WritingSnapshot> => {
        const { data: session, error } = await getSupabaseClient().auth.getSession();
        if (error || !session.session || session.session.user.id !== userId) throw new Error("로그인이 만료됐어요. 다시 로그인해 주세요.");
        let response: Response;
        try {
            response = await fetch(body ? "/api/writing" : `/api/writing?date=${encodeURIComponent(selectedDate)}`, {
                method: body ? "POST" : "GET", cache: "no-store",
                headers: { Authorization: `Bearer ${session.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body ? 160000 : 30000),
            });
        } catch { throw new Error("서버 응답을 받지 못했어요. 입력한 내용은 화면에 유지되니 저장 기록을 다시 확인해 주세요."); }
        let result;
        try { result = await response.json(); } catch { throw new Error("서버 응답을 확인하지 못했어요. 다시 불러와 주세요."); }
        if (!response.ok) throw new Error(result.error ?? "작문 요청을 처리하지 못했어요.");
        return result;
    }, [userId]);

    useEffect(() => {
        const tracker = sequence;
        const current = ++tracker.current;
        void call(date).then((result) => {
            if (current !== tracker.current) return;
            setData(result); setDrafts(answerTexts(result)); setToday(result.today);
        }).catch((error: unknown) => {
            if (current === tracker.current) setError(error instanceof Error ? error.message : "기록을 불러오지 못했어요.");
        }).finally(() => { if (current === tracker.current) setLoading(false); });
        return () => { if (current === tracker.current) tracker.current++; };
    }, [date, call]);

    useEffect(() => {
        const checkDate = () => setToday(koreanDate());
        const timer = window.setInterval(checkDate, 30000);
        window.addEventListener("focus", checkDate);
        return () => { window.clearInterval(timer); window.removeEventListener("focus", checkDate); };
    }, []);

    useEffect(() => {
        if (data?.status !== "generating" || pending) return;
        let cancelled = false;
        const timer = window.setInterval(() => {
            void call(date).then((result) => {
                if (cancelled) return;
                setData(result);
                if (result.status === "ready") { setDrafts(answerTexts(result)); setError(""); setNotice("오늘의 공용 문제 10개가 준비됐어요."); }
            }).catch(() => { if (!cancelled) setError("문제 준비 상태를 확인하지 못했어요. 다시 불러와 주세요."); });
        }, 5000);
        return () => { cancelled = true; window.clearInterval(timer); };
    }, [data?.status, date, call, pending]);

    const stored = data ? answerTexts(data) : Array(10).fill("");
    const dirty = drafts.some((answer, index) => answer.trim() !== stored[index]);
    const busy = loading || Boolean(pending);
    const questions = data?.date === date ? data.questions : [];
    const results = (data?.results ?? []).filter((result) => drafts[result.question_index].trim() === stored[result.question_index]);
    const written = drafts.filter((answer) => answer.trim()).length;
    const ungraded = drafts.filter((answer, index) => answer.trim() && !results.some((result) => result.question_index === index)).length;
    const total = results.reduce((sum, result) => sum + result.score, 0);
    const dates = [...new Set([today, date, ...(data?.history.map((day) => day.study_date) ?? [])])].sort().reverse();

    async function reload() {
        if (acting.current) return;
        const current = ++sequence.current;
        setLoading(true); setError("");
        try {
            const result = await call(date);
            if (sequence.current === current) { setData(result); if (!dirty) setDrafts(answerTexts(result)); }
        } catch (error) { if (sequence.current === current) setError(error instanceof Error ? error.message : "기록을 불러오지 못했어요."); }
        finally { if (sequence.current === current) setLoading(false); }
    }

    function chooseDate(value: string) {
        if (busy || dirty || value === date) return;
        setLoading(true); setError(""); setNotice(""); setData(null); setDrafts(Array(10).fill("")); setDate(value);
    }

    async function act(action: "prepare" | "save" | "grade") {
        if (acting.current || busy) return;
        acting.current = true;
        const current = ++sequence.current;
        setPending(action); setError(""); setNotice("");
        try {
            const answers = drafts.map((answer, index) => ({ index, answer, version: data?.answers.find((item) => item.question_index === index)?.version ?? 0 }));
            const result = await call(date, { action, date, answers });
            if (sequence.current !== current) return;
            if (result.date !== date) {
                setDate(result.date); setLoading(true); setPending(""); return;
            }
            setData(result); setDrafts(answerTexts(result));
            setNotice(action === "prepare" ? "오늘의 공용 문제 10개가 준비됐어요. 모든 사용자가 같은 문제로 연습해요." : action === "save" ? "작성한 답안을 계정에 저장했어요." : "채점 결과와 모범답안·풀이를 계정에 저장했어요.");
        } catch (error) {
            if (sequence.current !== current) return;
            setError(error instanceof Error ? error.message : "요청을 완료하지 못했어요.");
            // 채점 전에 저장한 답안의 버전을 갱신하되 현재 입력 내용은 유지합니다.
            try { const fresh = await call(date); if (sequence.current === current) setData(fresh); } catch { /* 기존 입력을 유지합니다. */ }
        } finally {
            acting.current = false;
            if (sequence.current === current) setPending("");
        }
    }

    return (
        <div className="mx-auto max-w-4xl">
            <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                    <p className="eyebrow">N3 WRITING PRACTICE</p>
                    <h1 className="mt-3 text-3xl font-bold sm:text-4xl">한국어를 일본어로, 하루 10문장</h1>
                    <p className="mt-4 max-w-xl leading-7 text-muted">한 문장씩 직접 써보고, 나의 표현을 다듬어보세요.<br />모두 같은 문제로 연습하지만 답안과 채점 기록은 나만 볼 수 있어요.</p>
                </div>
                <label className="min-w-52 text-sm font-semibold">날짜별 작문 기록
                    <select className="form-input" value={date} disabled={busy || dirty} onChange={(event) => chooseDate(event.target.value)}>
                        {dates.map((day) => <option key={day} value={day}>{day}{day === today ? " · 오늘" : " · 지난 문제"}</option>)}
                    </select>
                </label>
            </div>

            <div className="mt-7 rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <p><b>{date}</b><span className="ml-3 text-muted">N3 수준 · 서버 공통 10문제</span></p>
                    <p className="font-semibold text-accent">{results.length ? `${results.length}문항 채점 · ${total} / ${results.length * 10}점` : `작성 ${written} / 10문장`}</p>
                </div>
                {questions.length > 0 && <nav className="mt-4 flex flex-wrap gap-2" aria-label="작문 문항 바로가기">
                    {questions.map((question) => {
                        const grade = results.find((item) => item.question_index === question.question_index);
                        return <a key={question.question_index} href={`#writing-question-${question.question_index}`} aria-label={`${question.question_index + 1}번 문항${grade ? `, ${grade.score}점` : ""}`} className={`flex size-10 items-center justify-center rounded-xl border text-sm font-semibold ${grade?.score === 10 ? "border-green-700 text-green-700 dark:border-green-400 dark:text-green-400" : drafts[question.question_index].trim() ? "border-accent text-accent" : "border-line text-muted"}`}>{question.question_index + 1}</a>;
                    })}
                </nav>}
            </div>

            <p role="status" aria-live="polite" className="mt-4 min-h-7 text-sm leading-7 text-muted">{pending === "prepare" ? "오늘의 N3 공용 문제 10개를 만들고 있어요…" : pending === "grade" ? "작성한 문장을 저장하고 의미·문법·표현을 채점하고 있어요…" : pending === "save" ? "답안을 계정에 저장하는 중…" : loading ? "작문 기록을 불러오는 중…" : notice}</p>
            {error && <div className="mt-3 rounded-2xl border border-line bg-surface p-5"><p role="alert" className="text-sm leading-7">{error}</p><button className="secondary-button mt-3" disabled={busy} onClick={() => void reload()}>기록 다시 불러오기</button>{dirty && <p className="mt-3 text-xs text-muted">다시 불러와도 현재 입력한 문장은 화면에 유지해요.</p>}</div>}

            {!loading && questions.length === 0 && <section className="panel mt-6 py-12 text-center">
                <p className="font-japanese text-5xl text-accent" aria-hidden="true">書</p>
                <h2 className="mt-5 text-2xl font-bold">{data?.status === "generating" ? "오늘의 문제를 함께 기다리고 있어요" : date === today ? "오늘의 작문 연습을 준비해볼까요?" : "이 날짜에는 준비된 문제가 없어요"}</h2>
                <p className="mx-auto mt-4 max-w-lg leading-8 text-muted">한국어 문장 10개를 일본어로 바꾸는 연습이에요.<br />그날 첫 준비 요청 때 한 세트만 생성해 모든 사용자가 공유해요.</p>
                {data?.status === "generating" ? <p className="mt-6 text-sm text-accent">다른 사용자가 문제를 준비하고 있어요. 준비되면 자동으로 보여드려요.</p> : date === today ? <button className="primary-button mt-7" disabled={busy} onClick={() => void act("prepare")}>{pending === "prepare" ? "문제 만드는 중…" : "오늘의 10문제 준비하기 ✧"}</button> : <button className="primary-button mt-7" disabled={busy} onClick={() => chooseDate(today)}>오늘의 문제로 이동</button>}
            </section>}

            {!loading && questions.length > 0 && <>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><p>한국어 문장을 읽고 일본어로 써보세요. 모범답안과 달라도 의미가 맞으면 인정해요.</p><span>{dirty ? "저장하지 않은 변경사항이 있어요" : "답안과 채점 결과는 계정에 보관돼요"}</span></div>
                <div className="mt-5 space-y-5">
                    {questions.map((question) => {
                        const index = question.question_index;
                        const grade = results.find((item) => item.question_index === index);
                        return <section id={`writing-question-${index}`} key={`${date}:${index}`} className="panel scroll-mt-6 !p-5 sm:!p-7">
                            <div className="flex items-start gap-3 sm:gap-4">
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-sm font-bold text-accent">{String(index + 1).padStart(2, "0")}</span>
                                <div className="min-w-0 flex-1">
                                    <label htmlFor={`writing-answer-${index}`} className="block break-words text-base font-semibold leading-8 sm:text-lg">{question.korean}</label>
                                    <textarea id={`writing-answer-${index}`} lang="ja" value={drafts[index]} maxLength={600} rows={3} disabled={busy} spellCheck={false} placeholder="日本語で書いてみましょう。" aria-describedby={`writing-answer-note-${index}`} onChange={(event) => setDrafts((previous) => previous.map((answer, position) => position === index ? event.target.value : answer))} className="form-input mt-4 w-full resize-y text-base leading-8 disabled:opacity-60" />
                                    <div id={`writing-answer-note-${index}`} className="mt-2 flex justify-between gap-3 text-xs text-muted"><span>{grade ? "채점 결과 저장됨" : drafts[index].trim() !== stored[index] ? "답안 저장을 눌러 보관해 주세요" : drafts[index].trim() ? "답안 저장됨 · 아직 채점 전이에요" : "한 문장씩 천천히 써보세요"}</span><span>{drafts[index].length} / 600</span></div>
                                    {grade && <WritingFeedback grade={grade} />}
                                </div>
                            </div>
                        </section>;
                    })}
                </div>
                <div className="sticky bottom-3 z-10 mt-6 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <p className="text-sm text-muted">작성 <b className="text-ink">{written} / 10</b> · 오늘 채점 {data?.gradeUsed ?? 0} / {writingGradeLimit}회</p>
                        <div className="flex flex-wrap gap-2"><button className="secondary-button" disabled={busy || !dirty} onClick={() => setDrafts(stored)}>되돌리기</button><button className="secondary-button" disabled={busy || !dirty} onClick={() => void act("save")}>답안 저장</button><button className="primary-button" disabled={busy || !ungraded || (data?.gradeUsed ?? 0) >= writingGradeLimit} onClick={() => void act("grade")}>{pending === "grade" ? "채점하는 중…" : `작성한 ${ungraded}문장 채점하기`}</button></div>
                    </div>
                </div>
                <p className="mt-5 text-xs leading-6 text-muted">채점하면 답안을 먼저 저장해요. 같은 답안의 결과는 다시 사용하고, 수정한 문장만 새로 채점해요. 새 채점은 실패를 포함해 계정별 하루 최대 5회예요. 날짜를 바꾸기 전에는 답안을 저장해 주세요.</p>
                <p className="mt-2 text-xs leading-6 text-muted">AI 채점은 참고용이며 오류가 있을 수 있어요. 모범답안은 여러 가능한 표현 중 하나예요.</p>
            </>}
        </div>
    );
}

function WritingFeedback({ grade }: { grade: WritingGrade }) {
    const label = grade.score === 10 ? "정답" : grade.score >= 5 ? "부분 정답" : "다시 연습해요";
    return <div className="mt-5 border-t border-line pt-5">
        <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${grade.score === 10 ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-canvas text-accent"}`}>{label}</span><b className="text-sm">{grade.score} / 10점</b></div>
        <p className="mt-3 whitespace-pre-line text-sm leading-7">{grade.feedback}</p>
        <details className="mt-4 rounded-2xl border border-line bg-canvas">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-accent">모범답안·풀이와 교정 보기</summary>
            <div className="space-y-5 border-t border-line p-4 sm:p-5">
                <div><h3 className="text-xs font-bold text-accent">나의 문장을 다듬으면</h3><p lang="ja" className="mt-2 break-words text-lg leading-9">{grade.corrected}</p></div>
                <div className="border-t border-line pt-4"><h3 className="text-xs font-bold text-accent">모범답안</h3><p lang="ja" className="mt-2 break-words text-lg leading-9">{grade.reference}</p><p lang="ja" className="mt-2 break-words text-sm leading-7 text-muted">{grade.reading}</p><SpeechButton text={grade.reference} label="모범답안 듣기" /></div>
                <div><h3 className="text-sm font-bold">핵심 문법</h3><div className="mt-2 flex flex-wrap gap-2">{grade.grammar.map((point) => <span key={point} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">{point}</span>)}</div><p className="mt-3 whitespace-pre-line text-sm leading-8">{grade.explanation}</p></div>
                {grade.points.length > 0 && <div><h3 className="text-sm font-bold">이 부분을 고쳐보세요</h3><ul className="mt-3 space-y-3">{grade.points.map((point, index) => <li key={index} className="rounded-xl border border-line bg-surface p-4"><p lang="ja" className="break-words text-sm leading-7"><span className="text-muted">{point.original}</span><span aria-label="교정 후" className="mx-2 text-accent">→</span><b>{point.corrected}</b></p><p className="mt-2 text-sm leading-7 text-muted">{point.reason}</p></li>)}</ul></div>}
                {grade.alternatives.length > 0 && <div><h3 className="text-sm font-bold">이렇게 써도 좋아요</h3><ul lang="ja" className="mt-2 list-disc space-y-2 pl-5 text-sm leading-8">{grade.alternatives.map((answer) => <li key={answer}>{answer}</li>)}</ul></div>}
            </div>
        </details>
    </div>;
}
