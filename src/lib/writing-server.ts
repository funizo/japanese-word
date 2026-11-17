import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { generateStructured, StudyError } from "@/lib/ai-study-server";
import { termKey } from "@/lib/ai-study";
import { parseWritingQuestions, parseWritingReview, type WritingSnapshot, type WritingSolution } from "@/lib/writing";
import { restoreWritingSelection, shuffleWritingTokens, writingTokens } from "@/lib/writing-word-order";
import { writingQuestionInstructions, writingQuestionsSchema, writingReviewInstructions, writingReviewSchema } from "@/lib/writing-schema";

type Client = SupabaseClient<Database>;
const errors: [string, string, number][] = [
  ["WRITING_SERVER_NOT_CONFIGURED", "작문 저장소 연결 설정이 필요해요.", 503],
  ["WRITING_GENERATING", "오늘의 공용 문제를 준비하고 있어요. 잠시 후 자동으로 다시 확인할게요.", 409],
  ["WRITING_GENERATION_LIMIT", "오늘 문제 준비 중 오류가 반복됐어요. 관리자 확인이 필요해요.", 429],
  ["WRITING_REQUEST_EXPIRED", "처리 시간이 초과됐어요. 저장된 내용을 다시 불러와 주세요.", 409],
  ["WRITING_DAY_NOT_FOUND", "해당 날짜의 문제가 아직 준비되지 않았어요.", 404],
  ["DRAFT_CONFLICT", "다른 화면에서 답안이 변경됐어요. 현재 조합은 유지했으니 저장된 기록을 다시 확인해 주세요.", 409],
];

export async function writingCommand<T>(client: Client, action: string, payload: unknown = {}): Promise<T> {
  const secret = process.env.WRITING_SERVER_SECRET;
  if (!secret) throw new StudyError("작문 저장소 연결 설정이 필요해요.", 503);
  const { data, error } = await client.rpc("writing_command", { p_secret: secret, p_action: action, p_payload: payload as Json });
  if (error) {
    for (const [code, message, status] of errors) if (error.message.includes(code)) throw new StudyError(message, status);
    if (error.code === "23505") throw new StudyError("기존 문제와 겹치는 내용이 있어 저장하지 않았어요. 다시 준비해 주세요.", 409);
    if (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "")) throw new StudyError("작문 학습 저장소를 준비 중이에요.", 503);
    throw new StudyError("작문 기록을 처리하지 못했어요. 다시 불러와 주세요.", 500);
  }
  return data as T;
}

export async function writingSnapshot(client: Client, date: string): Promise<WritingSnapshot> {
  const { solutions, ...snapshot } = await writingCommand<WritingSnapshot & { solutions: (WritingSolution & { question_index: number })[] }>(client, "puzzle_snapshot", { date });
  return {
    ...snapshot,
    questions: snapshot.questions.map((question) => {
      const solution = solutions.find((item) => item.question_index === question.question_index);
      if (!solution) throw new StudyError("문제의 단어 보기를 불러오지 못했어요.", 503);
      // 공개된 날짜로 섞은 순서를 역산할 수 없도록 서버 전용 비밀값을 사용합니다.
      const seed = createHmac("sha256", process.env.WRITING_SERVER_SECRET!).update(`${date}:${question.question_index}`).digest("hex");
      return { ...question, words: shuffleWritingTokens(writingTokens(solution.reference, solution.tokens), seed) };
    }),
    // 문제를 교정한 뒤에는 이전 정답 문장으로 판정한 결과를 현재 결과로 표시하지 않습니다.
    results: snapshot.results.filter((result) => solutions.some((solution) => solution.question_index === result.question_index && solution.reference === result.reference)),
  };
}

export async function prepareWriting(client: Client) {
  if (!process.env.OPENAI_API_KEY) throw new StudyError("AI 연결 설정이 필요해요.", 503);
  const claim = await writingCommand<{ cached: boolean; date: string; requestId?: string }>(client, "generate_claim");
  if (claim.cached) return writingSnapshot(client, claim.date);
  let finished = false;
  try {
    const previous = await writingCommand<string[]>(client, "previous_questions");
    if (previous.length > 20000) throw new StudyError("문제가 많이 쌓여 저장소 점검이 필요해요.", 503);
    const raw = await generateStructured(`한국 날짜 ${claim.date}. 서버 전체가 공유할 N3 작문 문제 10개를 만드세요. 이전 한국어 문제와 중복하지 마세요. 제외 목록: ${JSON.stringify(previous)}`, writingQuestionsSchema, writingQuestionInstructions, "writing_questions");
    const questions = parseWritingQuestions(raw, previous.map(termKey));
    const review = await generateStructured(`다음 10문항을 처음부터 독립적으로 검수하세요. 한국어와 일본어의 정보 누락을 특히 확인하세요. ${JSON.stringify(questions.map((question, index) => ({ index, ...question })))}`, writingReviewSchema, writingReviewInstructions, "writing_question_review");
    parseWritingReview(review, questions.length);
    await writingCommand(client, "generate_finish", { date: claim.date, requestId: claim.requestId, questions: questions.map((question) => ({ ...question, key: termKey(question.korean) })), model: process.env.OPENAI_MODEL ?? "gpt-6-luna" });
    finished = true;
    return writingSnapshot(client, claim.date);
  } catch (error) {
    if (error instanceof Error && ["WRITING_MEANING_MISMATCH", "INVALID_WRITING_REVIEW"].includes(error.message)) throw new StudyError("한국어와 일본어의 의미·읽기 검수를 통과하지 못해 문제를 저장하지 않았어요. 다시 준비해 주세요.", 502);
    if (error instanceof Error && ["INVALID_WRITING_OUTPUT", "DUPLICATE_WRITING_OUTPUT"].includes(error.message)) throw new StudyError("새 문제의 정확성이나 중복 검사를 통과하지 못했어요. 다시 준비해 주세요.", 502);
    throw error;
  } finally {
    if (!finished) await writingCommand(client, "generate_fail", { date: claim.date, requestId: claim.requestId }).catch(() => undefined);
  }
}

export async function checkWriting(client: Client, date: string, answers: { index: number; answer: string; version: number }[]) {
  const snapshot = await writingSnapshot(client, date);
  for (const answer of answers) {
    const question = snapshot.questions.find((item) => item.question_index === answer.index);
    const selection = question ? restoreWritingSelection(question.words, answer.answer) : null;
    if (!question || selection?.length !== question.words.length) throw new StudyError("보기의 단어를 모두 한 번씩 사용해 문장을 완성해 주세요.", 400);
  }
  // 정답 판정과 기록 저장을 하나의 트랜잭션으로 처리하며 AI를 호출하지 않습니다.
  await writingCommand(client, "check", { date, answers });
  return writingSnapshot(client, date);
}
