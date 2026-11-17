import { termKey } from "@/lib/ai-study";
import { normalizeWritingSentence } from "@/lib/writing-word-order";

export type WritingQuestion = { question_index: number; korean: string; words: string[] };
export const writingGrammarPatterns = ["〜ことになっている", "〜ことにしている", "〜たばかり", "〜て以来", "〜うちに", "〜間に", "〜たびに", "〜おかげで", "〜せいで", "〜はずだ", "〜わけではない", "〜わけにはいかない", "〜わけがない", "〜とは限らない", "〜に違いない", "〜べきだ", "〜ことはない", "〜ないことはない", "〜ばかりでなく", "〜によって", "〜に比べて", "〜として", "〜に対して", "〜ついでに", "〜ほど〜ない", "〜ようとする", "〜ところだった", "〜ふりをする", "〜まま", "〜くらい"] as const;
export type WritingSolution = { korean: string; focus: string; reference: string; tokens?: string[]; reading: string; explanation: string; grammar: string[]; alternatives: string[] };
export type WritingAnswer = { question_index: number; answer: string; version: number; updated_at: string };
export type WritingGrade = { question_index: number; answer_version: number; score: number; feedback: string; corrected: string; points: { original: string; corrected: string; reason: string }[]; reference: string; reading: string; explanation: string; grammar: string[]; alternatives: string[]; graded_at: string };
export type WritingSnapshot = {
  today: string; date: string; status: "empty" | "generating" | "ready" | "failed";
  questions: WritingQuestion[]; answers: WritingAnswer[]; results: WritingGrade[];
  history: { study_date: string }[]; gradeUsed: number;
};

function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function strings(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => text(item, 220));
}

export function parseWritingQuestions(value: unknown, previous: Iterable<string> = []): WritingSolution[] {
  if (!record(value) || !Array.isArray(value.questions) || value.questions.length !== 10) throw new Error("INVALID_WRITING_OUTPUT");
  const seen = new Set(previous);
  const focuses = new Set<string>();
  for (const question of value.questions) {
    if (!record(question) || !text(question.korean, 220) || !text(question.focus, 100) || !writingGrammarPatterns.includes(question.focus as typeof writingGrammarPatterns[number]) || focuses.has(question.focus) || !text(question.reference, 300) || !text(question.reading, 400) || !text(question.explanation, 800) || !strings(question.grammar, 1, 3) || !question.grammar.includes(question.focus) || !strings(question.alternatives, 0, 2)) throw new Error("INVALID_WRITING_OUTPUT");
    focuses.add(question.focus);
    if (!strings(question.tokens, 3, 24) || question.tokens.some((token) => /\s/u.test(token) || !normalizeWritingSentence(token)) || normalizeWritingSentence(question.tokens.join("")) !== normalizeWritingSentence(question.reference)) throw new Error("INVALID_WRITING_OUTPUT");
    if (!/[가-힣]/u.test(question.korean) || !/[ぁ-ゖァ-ヺ一-龯]/u.test(question.reference)) throw new Error("INVALID_WRITING_OUTPUT");
    const key = termKey(question.korean);
    if (seen.has(key)) throw new Error("DUPLICATE_WRITING_OUTPUT");
    seen.add(key);
  }
  return value.questions as WritingSolution[];
}

export function parseWritingAnswers(value: unknown): { index: number; answer: string; version: number }[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("INVALID_ANSWERS");
  const indices = new Set<number>();
  return value.map((item) => {
    if (!record(item) || !Number.isInteger(item.index) || (item.index as number) < 0 || (item.index as number) > 9 || indices.has(item.index as number) || typeof item.answer !== "string" || item.answer.length > 600 || !Number.isInteger(item.version) || (item.version as number) < 0) throw new Error("INVALID_ANSWERS");
    indices.add(item.index as number);
    return { index: item.index as number, answer: item.answer.trim(), version: item.version as number };
  });
}

export function parseWritingReview(value: unknown, count: number): void {
  if (!record(value) || !Array.isArray(value.results) || value.results.length !== count) throw new Error("INVALID_WRITING_REVIEW");
  const remaining = new Set(Array.from({ length: count }, (_, index) => index));
  let rejected = false;
  for (const result of value.results) {
    if (!record(result) || !Number.isInteger(result.index) || !remaining.delete(result.index as number) || typeof result.valid !== "boolean" || !text(result.reason, 800)) throw new Error("INVALID_WRITING_REVIEW");
    if (!result.valid) rejected = true;
  }
  if (rejected) throw new Error("WRITING_MEANING_MISMATCH");
}
