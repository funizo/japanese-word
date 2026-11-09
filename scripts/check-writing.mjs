import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

// 실제 SDK·fetch를 HTTP 의존성 모형에 연결합니다. 운영 키와 운영 데이터는 사용하지 않습니다.
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
    const filename = path.resolve(file);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loaded = new Module(filename);
    cache.set(filename, loaded);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    loaded.require = (name) => name.startsWith("@/") ? load(`src/${name.slice(2)}.ts`) : require(name);
    loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
    return loaded.exports;
}
const { koreanDate, termKey } = load("src/lib/ai-study.ts");
const { parseWritingQuestions, parseWritingGrades, parseWritingAnswers, writingGrammarPatterns } = load("src/lib/writing.ts");
function questions() {
    return Array.from({ length: 10 }, (_, i) => ({ korean: `작문 검증용 한국어 문장 ${i}`, focus: writingGrammarPatterns[i], reference: `試験の文${i}です。`, reading: "しけんのぶんです。", explanation: "문법을 설명해요.", grammar: [writingGrammarPatterns[i]], alternatives: [] }));
}
assert.equal(parseWritingQuestions({ questions: questions() }).length, 10);
assert.throws(() => parseWritingQuestions({ questions: questions().slice(0, 9) }), /INVALID/);
assert.throws(() => parseWritingQuestions({ questions: questions() }, [termKey(questions()[0].korean)]), /DUPLICATE/);
assert.throws(() => parseWritingAnswers([{ index: 0, answer: "a", version: 0 }, { index: 0, answer: "b", version: 0 }]), /INVALID/);
assert.throws(() => parseWritingGrades({ results: [] }, [0]), /INVALID/);

const users = new Map();
function user(owner) {
    if (!users.has(owner)) users.set(owner, { answers: [], results: [], used: 0, job: null });
    return users.get(owner);
}
let shared = null;
let status = "empty";
let generationId;
let serial = 0;
let questionCalls = 0;
let gradeCalls = 0;
let aiMode = "valid";
const calls = [];
let notifyGeneration;
let releaseGeneration;
const generationStarted = new Promise((resolve) => { notifyGeneration = resolve; });
const generationGate = new Promise((resolve) => { releaseGeneration = resolve; });
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://localhost");
        const owner = req.headers.authorization?.replace("Bearer ", "");
        const current = user(owner);
        let raw = "";
        for await (const part of req) raw += part;
        const body = raw ? JSON.parse(raw) : {};
        calls.push(url.pathname);
        const send = (data, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
        const fail = (message) => send({ code: "P0001", message }, 400);
        const snapshot = (date = koreanDate()) => ({ today: koreanDate(), date, status, questions: shared ? shared.map((q, question_index) => ({ question_index, korean: q.korean })) : [], answers: current.answers, results: current.results.filter((r) => current.answers.find((a) => a.question_index === r.question_index)?.version === r.answer_version), gradeUsed: current.used, history: shared ? [{ study_date: koreanDate() }] : [] });
        if (url.pathname === "/auth/v1/user") return owner === "expired" ? send({ msg: "expired" }, 401) : send({ id: owner, aud: "authenticated", role: "authenticated" });
        if (url.pathname === "/v1/responses") {
            assert.equal(body.store, false);
            assert.equal(body.text.format.strict, true);
            const isQuestions = body.text.format.name === "writing_questions";
            if (isQuestions) questionCalls++; else gradeCalls++;
            if (aiMode === "rate") return send({ error: { message: "비공개 오류" } }, 429);
            let value;
            if (isQuestions) {
                await generationGate;
                value = { questions: questions() };
            } else {
                const size = body.text.format.schema.properties.results.minItems;
                const activeJob = [...users.values()].find((state) => state.job)?.job;
                value = { results: activeJob.items.slice(0, size).map((item) => ({ index: item.index, score: item.answer.includes("正解") ? 10 : 5, feedback: "검증용 피드백", corrected: "正しい文です。", points: [] })) };
                if (aiMode === "invalid-grade") value.results = [];
            }
            return send({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
        }
        if (url.pathname !== "/rest/v1/rpc/writing_command") return send({ error: "정의되지 않은 요청" }, 501);
        if (body.p_secret !== "writing-server-test-secret-long-enough") return fail("WRITING_SERVER_NOT_CONFIGURED");
        const payload = body.p_payload;
        const save = () => {
            for (const item of payload.answers) {
                const old = current.answers.find((answer) => answer.question_index === item.index);
                if (old?.answer === item.answer) continue;
                if ((old?.version ?? 0) !== item.version) throw new Error("DRAFT_CONFLICT");
                if (!old && !item.answer) continue;
                const next = { question_index: item.index, answer: item.answer, version: (old?.version ?? 0) + 1, updated_at: new Date().toISOString() };
                current.answers = [...current.answers.filter((answer) => answer.question_index !== item.index), next];
            }
        };
        switch (body.p_action) {
            case "snapshot": return send(snapshot(payload.date));
            case "generate_claim":
                if (shared) return send({ cached: true, date: koreanDate() });
                if (status === "generating") return fail("WRITING_GENERATING");
                status = "generating"; generationId = `generation-${++serial}`;
                notifyGeneration();
                return send({ cached: false, date: koreanDate(), requestId: generationId });
            case "previous_questions": return send([]);
            case "generate_finish":
                assert.equal(payload.requestId, generationId);
                shared = payload.questions; status = "ready";
                return send({});
            case "generate_fail": status = "failed"; return send({});
            case "save": save(); return send({});
            case "grade_claim": {
                save();
                if (current.job) return fail("WRITING_GRADING");
                const items = current.answers.filter((answer) => answer.answer && !current.results.some((result) => result.question_index === answer.question_index && result.answer_version === answer.version)).map((answer) => ({ ...shared[answer.question_index], index: answer.question_index, answer: answer.answer, version: answer.version }));
                if (!items.length) return send({ cached: true });
                if (current.used >= 5) return fail("WRITING_GRADE_LIMIT");
                current.used++; current.job = { requestId: `grade-${++serial}`, items };
                return send({ cached: false, ...current.job });
            }
            case "grade_finish":
                assert.equal(payload.requestId, current.job.requestId);
                current.results.push(...payload.results.map((result) => {
                    const saved = current.job.items.find((item) => item.index === result.index);
                    return { ...result, question_index: result.index, answer_version: saved.version, reference: saved.reference, reading: saved.reading, explanation: saved.explanation, grammar: saved.grammar, alternatives: saved.alternatives, graded_at: new Date().toISOString() };
                }));
                current.job = null; return send({});
            case "grade_fail": current.job = null; return send({});
            default: return fail("INVALID_WRITING_ACTION");
        }
    } catch (error) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ code: "P0001", message: error.message })); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
process.env.NEXT_PUBLIC_SUPABASE_URL = origin;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "local-test-public";
process.env.OPENAI_API_KEY = "local-test-openai-key";
process.env.OPENAI_BASE_URL = `${origin}/v1`;
process.env.WRITING_SERVER_SECRET = "writing-server-test-secret-long-enough";
const { GET, POST } = load("src/app/api/writing/route.ts");
function request(owner = "user-a", body, query = "") {
    return new Request(`${origin}/api/writing${query}`, { method: body ? "POST" : "GET", headers: { ...(owner ? { Authorization: `Bearer ${owner}` } : {}), ...(body ? { Origin: origin, "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
try {
    assert.equal((await GET(request(null))).status, 401);
    assert.equal((await GET(request("expired"))).status, 401);
    assert.equal((await GET(request("user-a", undefined, "?date=2026-02-30"))).status, 400);
    const wrongOrigin = request("user-a", { action: "prepare" }); wrongOrigin.headers.set("Origin", "https://other.invalid");
    assert.equal((await POST(wrongOrigin)).status, 403);
    const first = POST(request("user-a", { action: "prepare" }));
    await generationStarted;
    const second = await POST(request("user-b", { action: "prepare" }));
    releaseGeneration();
    assert.equal(second.status, 409);
    assert.equal((await first).status, 200);
    assert.equal(questionCalls, 1);
    assert.equal((await POST(request("user-b", { action: "prepare" }))).status, 200);
    assert.equal(questionCalls, 1);
    const a = await (await GET(request("user-a"))).json();
    const b = await (await GET(request("user-b"))).json();
    assert.deepEqual(a.questions, b.questions);
    assert.equal(a.questions.length, 10);
    assert.ok(!JSON.stringify(a).includes("reference"));
    const answer = { index: 0, answer: "正解です。", version: 0 };
    assert.equal((await POST(request("user-a", { action: "save", date: koreanDate(), answers: [answer] }))).status, 200);
    assert.equal((await POST(request("user-a", { action: "grade", date: koreanDate(), answers: [answer] }))).status, 200);
    let result = await (await GET(request("user-a"))).json();
    assert.equal(result.results[0].score, 10);
    assert.equal(result.results[0].reference, shared[0].reference);
    assert.equal((await POST(request("user-a", { action: "grade", date: koreanDate(), answers: [answer] }))).status, 200);
    assert.equal(gradeCalls, 1);
    assert.equal((await (await GET(request("user-b"))).json()).answers.length, 0);
    assert.equal((await POST(request("user-a", { action: "save", date: koreanDate(), answers: [{ ...answer, answer: "別の文です。" }] }))).status, 409);
    aiMode = "invalid-grade";
    assert.equal((await POST(request("user-a", { action: "grade", date: koreanDate(), answers: [{ ...answer, version: 1, answer: "別の文です。" }] }))).status, 502);
    result = await (await GET(request("user-a"))).json();
    assert.equal(result.answers[0].version, 2);
    assert.equal(result.results.length, 0);
    assert.equal(user("user-a").job, null);
    aiMode = "rate";
    assert.equal((await POST(request("user-b", { action: "grade", date: koreanDate(), answers: [answer] }))).status, 429);
    assert.equal(user("user-b").answers.length, 1);
    assert.equal(user("user-b").job, null);
    user("user-b").used = 5;
    assert.equal((await POST(request("user-b", { action: "grade", date: koreanDate(), answers: [answer] }))).status, 429);
    assert.equal((await POST(request("user-b", { action: "save", date: koreanDate(), answers: [{ ...answer, answer: "a".repeat(601) }] }))).status, 400);
    assert.equal((await POST(request("user-b", { action: "grade", date: koreanDate(), answers: [{ index: 1, answer: "", version: 0 }] }))).status, 400);
    assert.ok(calls.includes("/v1/responses") && calls.includes("/rest/v1/rpc/writing_command"));
    console.log("작문 API 검증 통과: 공용 10문제 동시 요청·재사용, 정답 비공개, 계정 격리, 저장·채점·캐시, 버전 충돌, AI 오류 후 답안 보존, 채점 한도.");
    console.log("외부 서비스는 로컬 HTTP 모형이며, DB 권한·트랜잭션은 writing-database.sql로 별도 검증합니다.");
} finally { releaseGeneration(); await new Promise((resolve) => server.close(resolve)); }
