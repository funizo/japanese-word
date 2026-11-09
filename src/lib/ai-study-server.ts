import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { koreanDate, lessonTerms, parseExamples, parseLessons, termKey, type StudyDay } from "@/lib/ai-study";
import { dailySchema, moreSchema, studyInstructions } from "@/lib/ai-study-schema";

type Client = SupabaseClient<Database>;
export class StudyError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}

export async function studyClient(request: Request, feature = "AI 회화 학습"): Promise<{ client: Client; userId: string }> {
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new StudyError(`로그인 후 ${feature}을 이용해 주세요.`, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new StudyError("학습 저장소 설정이 필요해요.", 503);
  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new StudyError("로그인이 만료됐어요. 다시 로그인해 주세요.", 401);
  return { client, userId: data.user.id };
}

export function studyResponse(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function studyFailure(error: unknown) {
  if (error instanceof StudyError) return studyResponse({ error: error.message }, error.status);
  return studyResponse({ error: "학습 자료를 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요." }, 500);
}

export function checkDatabase(error: { message: string; code?: string } | null): void {
  if (!error) return;
  const messages: [string, string, number][] = [
    ["GENERATION_BUSY", "다른 학습 자료를 생성 중이에요. 잠시 후 다시 불러와 주세요.", 409],
    ["DAILY_LIMIT", "오늘의 생성 한도 10회에 도달했어요. 저장된 자료는 계속 복습할 수 있어요.", 429],
    ["EXAMPLE_LIMIT", "이 표현의 예문은 최대 30개까지 저장할 수 있어요.", 429],
    ["DAY_NOT_FOUND", "저장된 학습 자료를 찾을 수 없어요.", 404],
    ["INVALID_GENERATION", "생성 요청이 만료됐어요. 다시 시도해 주세요.", 409],
  ];
  for (const [code, message, status] of messages) if (error.message.includes(code)) throw new StudyError(message, status);
  if (["42P01", "PGRST202", "PGRST205"].includes(error.code ?? "")) throw new StudyError("AI 학습 저장소를 준비 중이에요. 잠시 후 다시 이용해 주세요.", 503);
  throw new StudyError("학습 자료를 저장하거나 불러오지 못했어요. 다시 시도해 주세요.", 500);
}

export async function readStudyDay(client: Client, userId: string, date: string): Promise<StudyDay | null> {
  const { data, error } = await client.from("ai_study_days").select("study_date,lessons,created_at,model").eq("user_id", userId).eq("study_date", date).maybeSingle();
  checkDatabase(error);
  return data as StudyDay | null;
}

async function previousTerms(client: Client, userId: string) {
  const terms: { term_key: string; term: string; reading: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("ai_study_terms").select("term_key,term,reading").eq("user_id", userId).order("term_key").range(offset, offset + 999);
    checkDatabase(error);
    terms.push(...data!);
    // 제외 목록을 일부만 보내고 중복 방지를 보장하는 일이 없도록 합니다.
    if (terms.length > 20000) throw new StudyError("학습 자료가 많이 쌓였어요. 새 자료 생성 전 저장소 점검이 필요해요.", 503);
    if (data!.length < 1000) return terms;
  }
}

async function generate(input: string, schema: unknown): Promise<unknown> {
  return generateStructured(input, schema, studyInstructions, "japanese_study");
}

export async function generateStructured(input: string, schema: unknown, instructions: string, name: string): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new StudyError("AI 연결 설정이 아직 준비되지 않았어요. 잠시 후 다시 이용해 주세요.", 503);
  let response: Response;
  try {
    response = await fetch(`${process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/responses`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-6-luna", instructions, input, store: false, max_output_tokens: 12000, text: { format: { type: "json_schema", name, strict: true, schema } } }),
      signal: AbortSignal.timeout(85000),
    });
  } catch { throw new StudyError("AI 응답을 기다리는 시간이 길어졌어요. 잠시 후 다시 시도해 주세요.", 504); }
  if (!response.ok) {
    if (response.status === 429) throw new StudyError("AI 사용 한도 또는 요청 제한에 도달했어요. 잠시 후 다시 시도해 주세요.", 429);
    throw new StudyError("AI 생성 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", 502);
  }
  let result;
  try { result = await response.json(); } catch { throw new StudyError("AI 응답을 확인하지 못했어요. 다시 시도해 주세요.", 502); }
  if (result.status !== "completed" || !Array.isArray(result.output)) throw new StudyError("AI 응답이 완성되지 않았어요. 다시 시도해 주세요.", 502);
  const parts: string[] = [];
  for (const item of result.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
  }
  try { return JSON.parse(parts.join("")); } catch { throw new StudyError("AI 학습 자료 형식을 확인하지 못했어요. 다시 시도해 주세요.", 502); }
}

function asJson(value: unknown): Json { return value as Json; }

export async function generateStudy(client: Client, userId: string, kind: "daily" | "more", options?: { date: string; index: number; scene: string }) {
  const today = koreanDate();
  if (kind === "daily") {
    const cached = await readStudyDay(client, userId, today);
    if (cached) return { entry: cached, cached: true };
  }
  if (!process.env.OPENAI_API_KEY) throw new StudyError("AI 연결 설정이 아직 준비되지 않았어요. 잠시 후 다시 이용해 주세요.", 503);
  // 정규화한 중복 응답은 한 번만 다시 생성합니다. 재시도 역시 일별 횟수에 포함합니다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: requestId, error: claimError } = await client.rpc("claim_ai_generation", { p_kind: kind });
    checkDatabase(claimError);
    try {
      if (kind === "daily") {
        // 자정에 요청이 걸쳐도 DB가 예약한 날짜와 저장·조회 날짜를 일치시킵니다.
        const { data: reservation, error: reservationError } = await client.from("ai_generation_requests").select("study_date").eq("id", requestId!).eq("user_id", userId).single();
        checkDatabase(reservationError);
        const generationDate = reservation!.study_date;
        const cached = await readStudyDay(client, userId, generationDate);
        if (cached) return { entry: cached, cached: true };
        const previous = await previousTerms(client, userId);
        const raw = await generate(`한국 날짜 ${generationDate}의 새 표현 5개와 표현별 새 핵심 어휘 2개, 예문 6개를 만드세요. 이전 자료와 같은 의미의 표현도 피하세요. 제외 목록: ${JSON.stringify(previous.map(({ term, reading }) => ({ term, reading })))}`, dailySchema);
        const lessons = parseLessons(raw, previous.map((term) => term.term_key));
        const terms = lessons.flatMap(lessonTerms).map((term) => ({ ...term, key: termKey(term.term) }));
        const { error } = await client.rpc("save_ai_study_day", { p_request_id: requestId!, p_lessons: asJson(lessons), p_terms: asJson(terms), p_model: process.env.OPENAI_MODEL ?? "gpt-6-luna" });
        if (error?.code === "23505") {
          const cached = await readStudyDay(client, userId, generationDate);
          if (cached) return { entry: cached, cached: true };
          throw new Error("DUPLICATE_AI_OUTPUT");
        }
        checkDatabase(error);
        return { entry: await readStudyDay(client, userId, generationDate), cached: false };
      }
      const entry = await readStudyDay(client, userId, options!.date);
      if (!entry) throw new StudyError("저장된 학습 자료를 찾을 수 없어요.", 404);
      const lesson = entry.lessons[options!.index];
      if (lesson.examples.length + 4 > 30) throw new StudyError("이 표현의 예문은 최대 30개까지 저장할 수 있어요.", 429);
      const raw = await generate(`다음 표현의 새 예문 4개만 만드세요. 상황: ${options!.scene}. 표현·핵심 어휘와 기존 예문: ${JSON.stringify(lesson)}`, moreSchema);
      const examples = parseExamples((raw as { examples?: unknown })?.examples, 4, entry.lessons.flatMap((item) => item.examples));
      const { error } = await client.rpc("append_ai_study_examples", { p_request_id: requestId!, p_date: options!.date, p_index: options!.index, p_examples: asJson(examples) });
      checkDatabase(error);
      return { entry: await readStudyDay(client, userId, options!.date), start: lesson.examples.length, cached: false };
    } catch (error) {
      if (error instanceof Error && ["DUPLICATE_AI_OUTPUT", "INVALID_AI_OUTPUT"].includes(error.message)) {
        if (attempt === 0) continue;
        throw new StudyError("중복되지 않는 정확한 자료를 만들지 못했어요. 기존 기록은 유지됐어요. 잠시 후 다시 시도해 주세요.", 502);
      }
      throw error;
    } finally {
      // 저장 실패나 AI 오류가 나도 예약을 해제합니다. 원장에는 시도 횟수가 남습니다.
      await client.from("ai_generation_requests").update({ finished_at: new Date().toISOString() }).eq("id", requestId!).eq("user_id", userId).is("finished_at", null);
    }
  }
  throw new StudyError("자료를 생성하지 못했어요.", 502);
}

export async function readStudyBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (request.headers.get("Origin") !== new URL(request.url).origin) throw new StudyError("요청을 확인할 수 없어요. 페이지를 새로고침해 주세요.", 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) throw new StudyError("올바른 요청 형식이 아니에요.", 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > maxBytes) throw new StudyError("요청 내용이 너무 커요.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new StudyError("요청 내용이 없어요.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new StudyError("요청 내용이 너무 커요.", 413); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new StudyError("요청 내용을 확인해 주세요.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new StudyError("요청 내용을 확인해 주세요.", 400);
  return body as Record<string, unknown>;
}
