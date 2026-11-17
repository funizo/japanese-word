"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SpeechButton } from "@/components/speech-button";
import { getSupabaseClient } from "@/lib/supabase/client";
import { koreanDate } from "@/lib/ai-study";
import type { WritingGrade, WritingQuestion, WritingSnapshot } from "@/lib/writing";
import { restoreWritingSelection } from "@/lib/writing-word-order";

function answerTexts(data: WritingSnapshot) {
    return Array.from({ length: 10 }, (_, index) => data.answers.find((answer) => answer.question_index === index)?.answer ?? "");
}

export function WritingPractice() {
    const { user, loading, error } = useAuth();
    if (loading) return <p role="status">로그인 상태를 확인하는 중…</p>;
    if (error) return <section className="panel"><p role="alert">{error}</p><button className="secondary-button mt-4" onClick={() => window.location.reload()}>다시 확인하기</button></section>;
    if (!user) return (
        <section className="panel mx-auto max-w-2xl py-12 text-center">
            <p className="eyebrow">N3 SENTENCE BUILDER</p>
            <h1 className="mt-4 text-3xl font-bold">단어를 연결해 완성하는 일본어, 하루 10문장</h1>
            <p className="mt-5 leading-8 text-muted">한국어 문장을 보고 일본어 단어를 올바른 순서로 조합해 보세요.<br />정답과 문법 풀이를 확인하고, 나의 연습 기록을 계정에 보관해요.</p>
            <Link className="primary-button mt-7" href="/login">로그인하고 문장 조합 시작하기 →</Link>
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
                ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(body?.action === "prepare" ? 175000 : 30000),
            });
        } catch { throw new Error("서버 응답을 받지 못했어요. 조합한 문장은 화면에 유지되니 저장 기록을 다시 확인해 주세요."); }
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
    const correct = results.filter((result) => result.score === 10).length;
    const dates = [...new Set([today, date, ...(data?.history.map((day) => day.study_date) ?? [])])].sort().reverse();

    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);

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

    async function act(action: "prepare" | "save" | "check", questionIndex?: number) {
        if (acting.current || busy) return;
        acting.current = true;
        const current = ++sequence.current;
        setPending(action === "check" ? `check:${questionIndex}` : action); setError(""); setNotice("");
        try {
            const answers = drafts.map((answer, index) => ({ index, answer, version: data?.answers.find((item) => item.question_index === index)?.version ?? 0 }))
                .filter((answer) => action !== "check" || answer.index === questionIndex);
            const result = await call(date, { action, date, answers });
            if (sequence.current !== current) return;
            if (result.date !== date) {
                setDate(result.date); setLoading(true); setPending(""); return;
            }
            setData(result); setToday(result.today);
            // 한 문제를 확인해도 다른 문제에서 조합 중인 단어는 유지합니다.
            setDrafts((previous) => action === "check" ? previous.map((answer, index) => index === questionIndex ? answerTexts(result)[index] : answer) : answerTexts(result));
            setNotice(action === "prepare" ? "오늘의 공용 문제 10개가 준비됐어요." : action === "save" ? "조합 중인 문장을 계정에 저장했어요." : `${(questionIndex ?? 0) + 1}번 문제의 정답을 확인하고 기록을 저장했어요.`);
        } catch (error) {
            if (sequence.current !== current) return;
            setError(error instanceof Error ? error.message : "요청을 완료하지 못했어요.");
            // 저장된 답안의 버전을 갱신하되 현재 조합한 문장은 유지합니다.
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
                    <p className="eyebrow">N3 SENTENCE BUILDER</p>
                    <h1 className="mt-3 text-3xl font-bold sm:text-4xl">단어를 모아, 일본어 한 문장</h1>
                    <p className="mt-4 max-w-xl leading-7 text-muted">한국어 문장을 보고, 일본어 단어를 순서대로 눌러 보세요.<br />문장을 완성한 뒤 정답과 문법 풀이를 확인할 수 있어요.</p>
                </div>
                <label className="min-w-52 text-sm font-semibold">날짜별 연습 기록
                    <select className="form-input" value={date} disabled={busy || dirty} onChange={(event) => chooseDate(event.target.value)}>
                        {dates.map((day) => <option key={day} value={day}>{day}{day === today ? " · 오늘" : " · 지난 문제"}</option>)}
                    </select>
                </label>
            </div>

            <div className="mt-7 rounded-2xl border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <p><b>{date}</b><span className="ml-3 text-muted">N3 수준 · 하루 10문제</span></p>
                    <p className="font-semibold text-accent">정답 {correct} / 10 · 확인 {results.length} / 10</p>
                </div>
                {questions.length > 0 && <nav className="mt-4 flex flex-wrap gap-2" aria-label="작문 문항 바로가기">
                    {questions.map((question) => {
                        const grade = results.find((item) => item.question_index === question.question_index);
                        return <a key={question.question_index} href={`#writing-question-${question.question_index}`} aria-label={`${question.question_index + 1}번 문항${grade ? grade.score === 10 ? ", 정답" : ", 다시 도전" : ""}`} className={`flex size-10 items-center justify-center rounded-xl border text-sm font-semibold ${grade?.score === 10 ? "border-green-700 text-green-700 dark:border-green-400 dark:text-green-400" : drafts[question.question_index].trim() ? "border-accent text-accent" : "border-line text-muted"}`}>{question.question_index + 1}</a>;
                    })}
                </nav>}
            </div>

            <p role="status" aria-live="polite" className="mt-4 min-h-7 text-sm leading-7 text-muted">{pending === "prepare" ? "오늘의 N3 공용 문제 10개를 만들고 있어요…" : pending.startsWith("check:") ? "문장의 순서를 확인하고 기록을 저장하는 중…" : pending === "save" ? "조합 중인 문장을 저장하는 중…" : loading ? "연습 기록을 불러오는 중…" : notice}</p>
            {error && <div className="mt-3 rounded-2xl border border-line bg-surface p-5"><p role="alert" className="text-sm leading-7">{error}</p><button className="secondary-button mt-3" disabled={busy} onClick={() => void reload()}>기록 다시 불러오기</button>{dirty && <p className="mt-3 text-xs text-muted">다시 불러와도 현재 입력한 문장은 화면에 유지해요.</p>}</div>}

            {!loading && questions.length === 0 && <section className="panel mt-6 py-12 text-center">
                <p className="font-japanese text-5xl text-accent" aria-hidden="true">書</p>
                <h2 className="mt-5 text-2xl font-bold">{data?.status === "generating" ? "오늘의 문제를 함께 기다리고 있어요" : date === today ? "오늘의 문장 조합을 시작해 볼까요?" : "이 날짜에는 준비된 문제가 없어요"}</h2>
                <p className="mx-auto mt-4 max-w-lg leading-8 text-muted">흩어진 일본어 단어를 모아 한국어에 맞는 문장을 완성해 보세요.<br />매일 같은 10문제로 연습하고, 내 기록은 계정에 보관해요.</p>
                {data?.status === "generating" ? <p className="mt-6 text-sm text-accent">다른 사용자가 문제를 준비하고 있어요. 준비되면 자동으로 보여드려요.</p> : date === today ? <button className="primary-button mt-7" disabled={busy} onClick={() => void act("prepare")}>{pending === "prepare" ? "문제 만드는 중…" : "오늘의 10문제 준비하기 ✧"}</button> : <button className="primary-button mt-7" disabled={busy} onClick={() => chooseDate(today)}>오늘의 문제로 이동</button>}
            </section>}

            {!loading && questions.length > 0 && <>
                <p className="mt-6 text-sm leading-7 text-muted">단어를 모두 한 번씩 사용해 보세요. 선택한 단어를 다시 누르면 취소할 수 있어요.</p>
                <div className="mt-5 space-y-5">
                    {questions.map((question) => <WordOrderQuestion key={`${date}:${question.question_index}`} question={question} answer={drafts[question.question_index]} grade={results.find((item) => item.question_index === question.question_index)} disabled={busy} checking={pending === `check:${question.question_index}`} onChange={(answer) => setDrafts((previous) => previous.map((value, index) => index === question.question_index ? answer : value))} onCheck={() => void act("check", question.question_index)} />)}
                </div>
                <div className="sticky bottom-3 z-10 mt-6 rounded-2xl border border-line bg-surface p-4 shadow-lg sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div><p className="text-sm">정답 <b className="text-accent">{correct} / 10</b><span className="ml-3 text-muted">조합 {written} / 10</span></p><p className="mt-1 text-xs text-muted">{dirty ? "저장하지 않은 조합이 있어요" : "연습 기록은 계정에 보관돼요"}</p></div>
                        <div className="flex flex-wrap gap-2"><button className="secondary-button" disabled={busy || !dirty} onClick={() => setDrafts(stored)}>변경 취소</button><button className="primary-button" disabled={busy || !dirty} onClick={() => void act("save")}>{pending === "save" ? "저장 중…" : "진행 상황 저장"}</button></div>
                    </div>
                </div>
                <p className="mt-5 text-xs leading-6 text-muted">정답 확인 시 해당 문장과 결과를 저장해요. 조합 중인 다른 문장도 보관하려면 진행 상황을 저장해 주세요. 정답 확인은 횟수 제한 없이 다시 도전할 수 있어요.</p>
            </>}
        </div>
    );
}

export function WordOrderQuestion({ question, answer, grade, disabled, checking, onChange, onCheck }: {
    question: WritingQuestion; answer: string; grade?: WritingGrade; disabled: boolean; checking: boolean;
    onChange: (answer: string) => void; onCheck: () => void;
}) {
    const restored = restoreWritingSelection(question.words, answer);
    const selected = restored ?? [];
    const complete = selected.length === question.words.length && question.words.length > 0;
    const index = question.question_index;
    const titleId = `writing-question-title-${index}`;
    const instructionsId = `writing-instructions-${index}`;
    const chipClass = "min-h-11 max-w-full rounded-full border px-4 py-2.5 text-base leading-6 transition-colors break-words";

    return <section id={`writing-question-${index}`} aria-labelledby={titleId} className="panel scroll-mt-6 !p-5 sm:!p-7">
        <span className="inline-flex rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">문제 {index + 1} · N3 수준</span>
        <h2 id={titleId} className="mt-4 text-base font-semibold">다음 문장을 일본어로 완성하세요.</h2>
        <p className="mt-3 break-words text-xl font-bold leading-9 sm:text-2xl sm:leading-10">{question.korean}</p>
        <div className="mt-6 border-t border-line pt-6">
            <h3 className="text-base font-bold sm:text-lg">보기 — 단어를 올바른 순서로 배열하세요.</h3>
            <p id={instructionsId} className="mt-2 text-sm leading-7 text-muted">아래 단어를 순서대로 눌러 문장을 완성하세요.</p>
            <div className="mt-5 min-h-28 rounded-2xl border border-dashed border-line bg-canvas/40 p-4">
                <div className="flex items-center justify-between gap-3 text-xs text-muted"><p>내가 만든 문장</p><span>{selected.length} / {question.words.length}</span></div>
                <div aria-live="polite" aria-label="내가 만든 문장" className="mt-3">
                    {selected.length > 0 ? <ol lang="ja" className="flex flex-wrap gap-2">{selected.map((wordIndex, position) => <li key={wordIndex} className="max-w-full"><button type="button" className={`${chipClass} border-accent/25 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-60`} disabled={disabled} aria-label={`${position + 1}번째 단어 ${question.words[wordIndex]} 취소`} onClick={() => onChange(selected.filter((_, index) => index !== position).map((index) => question.words[index]).join(" "))}>{question.words[wordIndex]}<span aria-hidden="true" className="ml-2 text-xs opacity-60">×</span></button></li>)}</ol> : <p className="py-1 text-sm leading-7 text-muted">단어를 선택해 주세요.</p>}
                </div>
            </div>
            {restored === null && <p className="mt-3 text-xs leading-6 text-muted">이전 답안이 현재 단어 보기와 달라요. 문제가 수정되었거나 직접 작성한 답안일 수 있어요. 아래 단어로 다시 조합해 주세요.</p>}
            <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={`${index + 1}번 문제 단어 보기`} aria-describedby={instructionsId} lang="ja">
                {question.words.map((word, wordIndex) => <button type="button" key={wordIndex} className={`${chipClass} ${selected.includes(wordIndex) ? "border-line bg-canvas text-muted opacity-35" : "border-transparent bg-canvas text-ink hover:border-accent hover:text-accent"}`} disabled={disabled || selected.includes(wordIndex)} aria-label={`${word}${selected.includes(wordIndex) ? " 선택됨" : " 선택"}`} onClick={() => onChange([...selected, wordIndex].map((index) => question.words[index]).join(" "))}>{word}</button>)}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" className="secondary-button !rounded-full" disabled={disabled || !answer} onClick={() => onChange("")}>초기화</button>
                <button type="button" className="primary-button !rounded-full" disabled={disabled || !complete || Boolean(grade)} onClick={onCheck}>{checking ? "확인 중…" : grade ? "확인 완료" : "정답 확인"}</button>
            </div>
            {grade && <WritingFeedback grade={grade} />}
        </div>
    </section>;
}

function WritingFeedback({ grade }: { grade: WritingGrade }) {
    const correct = grade.score === 10;
    return <div className="mt-5 border-t border-line pt-5">
        <p role="status" className={`text-sm font-semibold leading-7 ${correct ? "text-green-700 dark:text-green-400" : "text-accent"}`}>{correct ? "정답이에요! 문장을 완성했어요." : "아직 순서가 맞지 않아요. 단어를 다시 배열해 보세요."}</p>
        <details className="mt-4 rounded-2xl border border-line bg-canvas">
            <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-accent">정답·문법 풀이 보기</summary>
            <div className="space-y-5 border-t border-line p-4 sm:p-5">
                <div><h3 className="text-xs font-bold text-accent">정답 문장</h3><p lang="ja" className="mt-2 break-words text-lg leading-9">{grade.reference}</p><p lang="ja" className="mt-2 break-words text-sm leading-7 text-muted">{grade.reading}</p><SpeechButton text={grade.reference} label="정답 문장 듣기" /></div>
                <div><h3 className="text-sm font-bold">핵심 문법</h3><div className="mt-2 flex flex-wrap gap-2">{grade.grammar.map((point) => <span key={point} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">{point}</span>)}</div><p className="mt-3 whitespace-pre-line text-sm leading-8">{grade.explanation}</p></div>
                {grade.alternatives.length > 0 && <div><h3 className="text-sm font-bold">이렇게 써도 좋아요</h3><ul lang="ja" className="mt-2 list-disc space-y-2 pl-5 text-sm leading-8">{grade.alternatives.map((answer) => <li key={answer}>{answer}</li>)}</ul></div>}
            </div>
        </details>
    </div>;
}
