import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

// 실제 Supabase SDK와 fetch를 로컬 HTTP 서버에 연결합니다. 운영 키와 운영 데이터는 사용하지 않습니다.
const root = process.cwd();
const require = createRequire(import.meta.url);
const modules = new Map();
function load(file) {
  const filename = path.join(root, file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loadedModule = new Module(filename);
  modules.set(filename, loadedModule);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));
  loadedModule.require = (name) => name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name);
  loadedModule._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, filename);
  return loadedModule.exports;
}
const { koreanDate, termKey, validStudyDate, parseLessons, parseExamples } = load("src/lib/ai-study.ts");
assert.equal(termKey(" ～ ＡＢＣ！ "), termKey("abc"));
assert.equal(koreanDate(new Date("2026-11-08T15:00:00Z")), "2026-11-09");
assert.equal(validStudyDate("2026-02-30"), false);
assert.equal(validStudyDate("2028-02-29"), true);

let serial = 0;
function lessons(prefix) {
  return { lessons: Array.from({ length: 5 }, (_, i) => ({
    title: `${prefix}表現${i}です`, canonical: `${prefix}表現${i}`, reading: "ひょうげん", meaning: "한국어 뜻", category: "일상 · N4", rule: "문법 설명", tip: "사용 팁",
    vocabulary: [0, 1].map((v) => ({ term: `${prefix}語彙${i}${v}`, reading: "ごい", meaning: "어휘 뜻" })),
    examples: Array.from({ length: 6 }, (_, e) => ({ jp: `${prefix}例文${i}${e}`, reading: "れいぶん", ko: "예문 해석", reply: "はい、そうです。", replyKo: "네, 그래요." })),
  })) };
}
const sample = lessons("初回");
assert.equal(parseLessons(sample, []).length, 5);
assert.throws(() => parseLessons(sample, [termKey(sample.lessons[0].canonical)]), /DUPLICATE/);
assert.throws(() => parseLessons(sample, [termKey(sample.lessons[0].title)]), /DUPLICATE/);
assert.throws(() => parseExamples(Array(4).fill(sample.lessons[0].examples[0]), 4), /DUPLICATE/);

const states = new Map();
function state(owner) {
  if (!states.has(owner)) states.set(owner, { days: new Map(), terms: [], completed: [], attempts: [], active: null });
  return states.get(owner);
}
const calls = [];
let aiMode = "valid";
let aiCalls = 0;
let lastPrompt = "";
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const owner = request.headers.authorization?.replace("Bearer ", "");
    const current = state(owner);
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    calls.push({ path: url.pathname, method: request.method });
    const send = (value, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    const date = url.searchParams.get("study_date")?.replace("eq.", "") ?? koreanDate();
    if (url.pathname === "/auth/v1/user") {
      return owner === "expired" ? send({ msg: "expired" }, 401) : send({ id: owner, aud: "authenticated", role: "authenticated", email: "test@example.invalid" });
    }
    if (url.pathname === "/v1/responses") {
      aiCalls++; lastPrompt = body.input;
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      if (aiMode === "rate") return send({ error: { message: "비공개 내부 오류" } }, 429);
      if (aiMode === "html") { response.writeHead(502, { "Content-Type": "text/html" }); return response.end("upstream failed"); }
      let output;
      if (body.text.format.schema.properties.examples) {
        output = { examples: Array.from({ length: 4 }, (_, i) => ({ jp: `追加${++serial}の例文${i}`, reading: "ついか", ko: "추가 예문", reply: "はい。", replyKo: "네." })) };
        if (aiMode === "duplicate-more") output.examples[1] = output.examples[0];
      } else {
        output = lessons(`生成${++serial}`);
        if (aiMode === "duplicate-once") { output.lessons[0].canonical = "既存表現"; aiMode = "valid"; }
        if (aiMode === "invalid") output.lessons = [];
      }
      return send({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }] });
    }
    if (url.pathname.endsWith("/rpc/claim_ai_generation")) {
      if (current.active) return send({ message: "GENERATION_BUSY", code: "P0001" }, 400);
      if (current.attempts.length >= 10) return send({ message: "DAILY_LIMIT", code: "P0001" }, 400);
      const id = `request-${++serial}`;
      current.attempts.push(id); current.active = id;
      return send(id);
    }
    if (url.pathname.endsWith("/rpc/save_ai_study_day")) {
      assert.equal(current.active, body.p_request_id);
      if (body.p_terms.some((term) => current.terms.some((old) => old.term_key === term.key))) return send({ code: "23505", message: "duplicate" }, 409);
      current.days.set(koreanDate(), { study_date: koreanDate(), lessons: body.p_lessons, created_at: new Date().toISOString(), model: body.p_model });
      current.terms.push(...body.p_terms.map((term) => ({ ...term, term_key: term.key })));
      current.active = null;
      return send(null);
    }
    if (url.pathname.endsWith("/rpc/append_ai_study_examples")) {
      const entry = current.days.get(body.p_date);
      entry.lessons[body.p_index].examples.push(...body.p_examples);
      current.active = null;
      return send(null);
    }
    if (url.pathname === "/rest/v1/ai_study_days") {
      if (url.searchParams.has("study_date")) return send([...current.days.values()].filter((entry) => entry.study_date === date));
      return send([...current.days.values()].map(({ study_date, created_at }) => ({ study_date, created_at })));
    }
    if (url.pathname === "/rest/v1/ai_study_terms") return send(current.terms);
    if (url.pathname === "/rest/v1/ai_generation_requests") {
      if (request.method === "PATCH") { current.active = null; return send(undefined, 204); }
      if (request.method === "GET" && url.searchParams.has("id")) return send({ study_date: koreanDate() });
      response.setHeader("Content-Range", `0-0/${current.attempts.length}`);
      return send([]);
    }
    if (url.pathname === "/rest/v1/ai_study_progress") {
      if (request.method === "POST") {
        if (!current.completed.some((row) => row.study_date === body.study_date && row.lesson_index === body.lesson_index)) current.completed.push(body);
        return send(undefined, 201);
      }
      return send(current.completed.filter((row) => row.study_date === date));
    }
    return send({ error: "검증에 정의되지 않은 의존성 요청" }, 501);
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "local-test-public-key";
process.env.OPENAI_API_KEY = "local-test-secret";
process.env.OPENAI_BASE_URL = `${origin}/v1`;
const { GET, POST } = load("src/app/api/ai-study/route.ts");
function request(owner = "user-a", body, suffix = "") {
  return new Request(`${origin}/api/ai-study${suffix}`, { method: body ? "POST" : "GET", headers: { ...(owner ? { Authorization: `Bearer ${owner}` } : {}), ...(body ? { Origin: origin, "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
try {
  assert.equal((await GET(request(null))).status, 401);
  assert.equal((await GET(request("expired"))).status, 401);
  assert.equal((await GET(request("user-a", undefined, "?date=2026-02-30"))).status, 400);
  const crossOrigin = request("user-a", { action: "generate" });
  crossOrigin.headers.set("Origin", "https://other.invalid");
  assert.equal((await POST(crossOrigin)).status, 403);
  assert.equal((await POST(request("user-a", { action: "generate", extra: "a".repeat(4096) }))).status, 413);
  let response = await GET(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entry, null);
  response = await POST(request("user-a", { action: "generate" }));
  assert.equal(response.status, 200);
  const generated = await response.json();
  assert.equal(generated.entry.lessons.length, 5);
  assert.equal(state("user-a").terms.length, 20);
  const paidCalls = aiCalls;
  response = await POST(request("user-a", { action: "generate" }));
  assert.equal((await response.json()).cached, true);
  assert.equal(aiCalls, paidCalls);
  assert.equal((await (await GET(request("user-b"))).json()).entry, null);

  const moreBody = { action: "more", date: koreanDate(), index: 0, scene: "다양한 일상" };
  response = await POST(request("user-a", moreBody));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entry.lessons[0].examples.length, 10);
  aiMode = "duplicate-more";
  response = await POST(request("user-a", moreBody));
  assert.equal(response.status, 502);
  assert.equal(state("user-a").days.get(koreanDate()).lessons[0].examples.length, 10);
  assert.equal(state("user-a").active, null);
  aiMode = "valid";

  for (let i = 0; i < 2; i++) assert.equal((await POST(request("user-a", { action: "complete", date: koreanDate(), index: 0 }))).status, 200);
  const refreshed = await (await GET(request("user-a"))).json();
  assert.deepEqual(refreshed.completed, [0]);
  assert.equal(refreshed.history.length, 1);

  state("user-b").terms.push({ term_key: termKey("既存表現"), term: "既存表現", reading: "きそんひょうげん" });
  aiMode = "duplicate-once";
  response = await POST(request("user-b", { action: "generate" }));
  assert.equal(response.status, 200);
  assert.equal(state("user-b").attempts.length, 2);
  assert.ok(lastPrompt.includes("既存表現"));
  aiMode = "invalid";
  assert.equal((await POST(request("user-c", { action: "generate" }))).status, 502);
  assert.equal(state("user-c").days.size, 0);
  assert.equal(state("user-c").terms.length, 0);
  assert.equal(state("user-c").active, null);
  aiMode = "rate";
  response = await POST(request("user-d", { action: "generate" }));
  assert.equal(response.status, 429);
  assert.ok(!(await response.text()).includes("비공개 내부 오류"));
  aiMode = "html";
  assert.equal((await POST(request("user-e", { action: "generate" }))).status, 502);
  state("user-f").attempts = Array(10).fill("used");
  assert.equal((await POST(request("user-f", { action: "generate" }))).status, 429);
  state("user-g").active = "pending";
  assert.equal((await POST(request("user-g", { action: "generate" }))).status, 409);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await POST(request("user-h", { action: "generate" }))).status, 503);
  assert.equal(state("user-h").attempts.length, 0);
  assert.equal((await POST(request("user-a", { action: "generate" }))).status, 200);
  assert.ok(calls.some((call) => call.path === "/v1/responses"));
  assert.ok(calls.some((call) => call.path.endsWith("/rpc/save_ai_study_day")));
  console.log("AI 회화 검증 통과: 실제 HTTP 직렬화, 세션 확인, 생성·저장·복습, 기본형·표시형 중복, 추가 예문, 완료 멱등성, 계정 구분, 오류·횟수 제한.");
  console.log("의존성은 로컬 HTTP 모형이며, 운영 DB의 트랜잭션·RLS는 별도 롤백 검사로 확인합니다.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
