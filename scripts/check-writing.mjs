import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
    loaded.require = (name) => {
        if (!name.startsWith("@/")) return require(name);
        const source = `src/${name.slice(2)}`;
        return load(fs.existsSync(`${source}.ts`) ? `${source}.ts` : `${source}.tsx`);
    };
    loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    return loaded.exports;
}
const { koreanDate, termKey } = load("src/lib/ai-study.ts");
const { parseWritingQuestions, parseWritingAnswers, parseWritingReview, writingGrammarPatterns } = load("src/lib/writing.ts");
const { normalizeWritingSentence, writingTokens, shuffleWritingTokens, restoreWritingSelection } = load("src/lib/writing-word-order.ts");
function questions() {
    return Array.from({ length: 10 }, (_, i) => ({ korean: `작문 검증용 한국어 문장 ${i}`, focus: writingGrammarPatterns[i], reference: `試験の文${i}です。`, tokens: ["試験の", `文${i}`, "です"], reading: "しけんのぶんです。", explanation: "문법을 설명해요.", grammar: [writingGrammarPatterns[i]], alternatives: [] }));
}
assert.equal(parseWritingQuestions({ questions: questions() }).length, 10);
assert.throws(() => parseWritingQuestions({ questions: questions().slice(0, 9) }), /INVALID/);
assert.throws(() => parseWritingQuestions({ questions: questions() }, [termKey(questions()[0].korean)]), /DUPLICATE/);
assert.throws(() => parseWritingAnswers([{ index: 0, answer: "a", version: 0 }, { index: 0, answer: "b", version: 0 }]), /INVALID/);
const invalidTokens = questions(); invalidTokens[0].tokens = ["別の", "文章", "です"];
assert.throws(() => parseWritingQuestions({ questions: invalidTokens }), /INVALID/);
const goodReview = () => ({ results: Array.from({ length: 10 }, (_, index) => ({ index, valid: true, reason: "한국어와 일본어의 의미·읽기가 일치해요." })) });
assert.doesNotThrow(() => parseWritingReview(goodReview(), 10));
const missingBusinessTrip = goodReview(); missingBusinessTrip.results[0] = { index: 0, valid: false, reason: "출장에 해당하는 出張이 누락되었고 존대가 달라요." };
assert.throws(() => parseWritingReview(missingBusinessTrip, 10), /WRITING_MEANING_MISMATCH/);
assert.throws(() => parseWritingReview({ results: goodReview().results.slice(1) }, 10), /INVALID_WRITING_REVIEW/);
const duplicateReview = goodReview(); duplicateReview.results[1].index = 0;
assert.throws(() => parseWritingReview(duplicateReview, 10), /INVALID_WRITING_REVIEW/);
assert.throws(() => parseWritingReview({ results: goodReview().results.map((item) => ({ ...item, valid: "true" })) }, 10), /INVALID_WRITING_REVIEW/);
assert.deepEqual(writingTokens("明日は発表をします。", ["明日は", "発表を", "します"]), ["明日は", "発表を", "します"]);
assert.equal(normalizeWritingSentence(writingTokens("明日は発表をします。").join("")), "明日は発表をします");
const bank = ["私も", "友達も", "私も", "行きます"];
assert.deepEqual(restoreWritingSelection(bank, "私も 友達も 私も 行きます"), [0, 1, 2, 3]);
assert.equal(restoreWritingSelection(bank, "私も 私も 私も 行きます"), null);
assert.deepEqual(restoreWritingSelection(["こと", "ことは", "は"], "ことはこと"), [1, 0]);
assert.deepEqual(restoreWritingSelection(bank, "私も"), [0]);
assert.equal(restoreWritingSelection(bank, "無関係です"), null);
assert.deepEqual(shuffleWritingTokens(bank, "2026-11-17:0"), shuffleWritingTokens(bank, "2026-11-17:0"));
assert.deepEqual(shuffleWritingTokens(bank, "2026-11-17:0").toSorted(), bank.toSorted());

// 브라우저 연결 없이도 문항의 실제 버튼 이벤트와 표시 상태를 검증합니다.
const { WordOrderQuestion } = load("src/components/writing-practice.tsx");
let draft = "";
let checks = 0;
const questionProps = { question: { question_index: 0, korean: "내일 발표를 합니다.", words: ["明日", "発表を", "します"] }, disabled: false, checking: false, onChange: (answer) => { draft = answer; }, onCheck: () => { checks++; } };
const renderQuestion = (extra = {}) => WordOrderQuestion({ ...questionProps, answer: draft, ...extra });
function buttons(element) {
    const found = [];
    function visit(node) {
        if (!isValidElement(node)) return;
        if (node.type === "button") found.push(node);
        Children.forEach(node.props.children, visit);
    }
    visit(element);
    return found;
}
const control = (label, extra) => buttons(renderQuestion(extra)).find((button) => button.props.children === label);
const choose = (word) => {
    const button = buttons(renderQuestion()).find((button) => button.props["aria-label"] === `${word} 선택`);
    assert.equal(button.props.disabled, false);
    button.props.onClick();
};
assert.equal(control("정답 확인").props.disabled, true);
assert.equal(control("초기화").props.disabled, true);
assert.ok(!renderToStaticMarkup(renderQuestion()).includes("textarea"));
choose("発表を");
assert.equal(draft, "発表を");
assert.equal(buttons(renderQuestion()).find((button) => button.props["aria-label"] === "発表を 선택됨").props.disabled, true);
choose("明日"); choose("します");
assert.equal(draft, "発表を 明日 します");
assert.equal(control("정답 확인").props.disabled, false);
control("정답 확인").props.onClick(); assert.equal(checks, 1);
buttons(renderQuestion()).find((button) => button.props["aria-label"] === "2번째 단어 明日 취소").props.onClick();
assert.equal(draft, "発表を します");
assert.equal(control("정답 확인").props.disabled, true);
control("초기화").props.onClick(); assert.equal(draft, "");
choose("明日"); choose("発表を"); choose("します");
assert.equal(control("정답 확인", { disabled: true }).props.disabled, true);
const feedback = { score: 10, reference: "明日発表をします。", reading: "あしたはっぴょうをします。", grammar: ["〜ます"], explanation: "문장 풀이", points: [], alternatives: [] };
assert.ok(renderToStaticMarkup(renderQuestion({ grade: feedback })).includes("정답이에요!"));
assert.equal(control("확인 완료", { grade: feedback }).props.disabled, true);
assert.ok(renderToStaticMarkup(renderQuestion({ grade: { ...feedback, score: 0 } })).includes("아직 순서가 맞지 않아요"));

const users = new Map();
function user(owner) {
    if (!users.has(owner)) users.set(owner, { answers: [], results: [], used: 0 });
    return users.get(owner);
}
let shared = null;
let status = "empty";
let generationId;
let serial = 0;
let questionCalls = 0;
let reviewCalls = 0;
let reviewMode = "valid";
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
            if (body.text.format.name === "writing_question_review") {
                reviewCalls++;
                assert.ok(body.instructions.includes("出張"));
                const review = reviewMode === "mismatch" ? missingBusinessTrip : reviewMode === "invalid" ? { results: [] } : goodReview();
                return send({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(review) }] }] });
            }
            const isQuestions = body.text.format.name === "writing_questions";
            if (!isQuestions) { gradeCalls++; return send({ error: "AI 채점은 지원하지 않아요." }, 501); }
            questionCalls++;
            if (aiMode === "rate") return send({ error: { message: "비공개 오류" } }, 429);
            await generationGate;
            const value = { questions: questions() };
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
            case "puzzle_snapshot": return send({ ...snapshot(payload.date), solutions: shared?.map((item, question_index) => ({ ...item, question_index })) ?? [] });
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
            case "check": {
                save();
                for (const item of payload.answers) {
                    const saved = current.answers.find((answer) => answer.question_index === item.index);
                    const solution = shared[item.index];
                    const correct = [solution.reference, ...solution.alternatives].some((answer) => normalizeWritingSentence(answer) === normalizeWritingSentence(saved.answer));
                    current.results = current.results.filter((result) => result.question_index !== item.index || result.answer_version !== saved.version);
                    current.results.push({ question_index: item.index, answer_version: saved.version, score: correct ? 10 : 0, feedback: "단어 배열 결과", corrected: solution.reference, points: [], reference: solution.reference, reading: solution.reading, explanation: solution.explanation, grammar: solution.grammar, alternatives: solution.alternatives, graded_at: new Date().toISOString() });
                }
                return send({});
            }
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
    assert.equal(reviewCalls, 1);
    assert.equal((await POST(request("user-b", { action: "prepare" }))).status, 200);
    assert.equal(questionCalls, 1);
    const a = await (await GET(request("user-a"))).json();
    const b = await (await GET(request("user-b"))).json();
    assert.deepEqual(a.questions, b.questions);
    assert.equal(a.questions.length, 10);
    assert.ok(!JSON.stringify(a).includes("reference"));
    assert.ok(!JSON.stringify(a).includes("solutions"));
    assert.deepEqual(a.questions[0].words.toSorted(), shared[0].tokens.toSorted());
    assert.notDeepEqual(a.questions[0].words, shared[0].tokens);
    const answer = { index: 0, answer: shared[0].tokens.join(" "), version: 0 };
    assert.equal((await POST(request("user-a", { action: "save", date: koreanDate(), answers: [answer] }))).status, 200);
    assert.equal((await POST(request("user-a", { action: "check", date: koreanDate(), answers: [answer] }))).status, 200);
    let result = await (await GET(request("user-a"))).json();
    assert.equal(result.results[0].score, 10);
    assert.equal(result.results[0].reference, shared[0].reference);
    // 번역을 교정하면 이전 정답 문장으로 판정한 기록을 다시 노출하지 않습니다.
    const oldReference = shared[0].reference;
    shared[0].reference = `出張の${oldReference}`;
    const correctedSnapshot = await (await GET(request("user-a"))).json();
    assert.equal(correctedSnapshot.results.length, 0);
    assert.equal(correctedSnapshot.answers.length, 1);
    assert.ok(correctedSnapshot.questions[0].words.some((word) => word.includes("出張")));
    shared[0].reference = oldReference;
    assert.equal((await POST(request("user-a", { action: "check", date: koreanDate(), answers: [answer] }))).status, 200);
    assert.equal(gradeCalls, 0);
    assert.equal(reviewCalls, 1);
    assert.equal((await (await GET(request("user-b"))).json()).answers.length, 0);
    assert.equal((await POST(request("user-a", { action: "save", date: koreanDate(), answers: [{ ...answer, answer: "別の文です。" }] }))).status, 409);
    const wrongAnswer = [...shared[0].tokens].reverse().join(" ");
    assert.equal((await POST(request("user-a", { action: "check", date: koreanDate(), answers: [{ ...answer, version: 1, answer: wrongAnswer }] }))).status, 200);
    result = await (await GET(request("user-a"))).json();
    assert.equal(result.answers[0].version, 2);
    assert.equal(result.results[0].score, 0);
    assert.equal((await POST(request("user-a", { action: "check", date: koreanDate(), answers: [{ ...answer, version: 2 }] }))).status, 200);
    assert.equal((await (await GET(request("user-a"))).json()).results[0].score, 10);
    aiMode = "rate";
    user("user-b").used = 5;
    // AI 장애·과거 채점 한도와 관계없이 각 문제를 확인할 수 있어야 합니다.
    delete process.env.OPENAI_API_KEY;
    for (let index = 0; index < 6; index++) {
        assert.equal((await POST(request("user-b", { action: "check", date: koreanDate(), answers: [{ index, answer: shared[index].tokens.join(" "), version: 0 }] }))).status, 200);
    }
    assert.equal(user("user-b").results.length, 6);
    assert.equal(gradeCalls, 0);
    assert.equal((await POST(request("user-b", { action: "save", date: koreanDate(), answers: [{ ...answer, answer: "a".repeat(601) }] }))).status, 400);
    assert.equal((await POST(request("user-b", { action: "check", date: koreanDate(), answers: [{ index: 1, answer: "", version: 0 }] }))).status, 400);
    assert.equal((await POST(request("user-b", { action: "check", date: koreanDate(), answers: [{ index: 1, answer: shared[1].tokens[0], version: 1 }] }))).status, 400);
    assert.equal((await POST(request("user-b", { action: "check", date: koreanDate(), answers: [{ index: 1, answer: Array(3).fill(shared[1].tokens[0]).join(" "), version: 1 }] }))).status, 400);
    assert.equal((await POST(request("user-b", { action: "grade", date: koreanDate(), answers: [answer] }))).status, 400);
    // 단어 분할 정보가 없는 과거 문제도 보기를 생성합니다.
    delete shared[0].tokens;
    const legacy = await (await GET(request("user-a"))).json();
    assert.deepEqual(legacy.questions[0].words.toSorted(), writingTokens(shared[0].reference).toSorted());
    assert.ok(legacy.questions[0].words.length > 1);
    process.env.OPENAI_API_KEY = "local-test-openai-key";
    aiMode = "valid";
    shared = null;
    status = "empty";
    reviewMode = "mismatch";
    const rejectedMeaning = await POST(request("user-a", { action: "prepare" }));
    assert.equal(rejectedMeaning.status, 502);
    assert.ok((await rejectedMeaning.json()).error.includes("의미"));
    assert.equal(shared, null);
    assert.equal(status, "failed");
    reviewMode = "invalid";
    assert.equal((await POST(request("user-a", { action: "prepare" }))).status, 502);
    assert.equal(shared, null);
    reviewMode = "valid";
    assert.equal((await POST(request("user-a", { action: "prepare" }))).status, 200);
    assert.equal(shared.length, 10);
    assert.ok(calls.includes("/v1/responses") && calls.includes("/rest/v1/rpc/writing_command"));
    console.log("단어 배열 API 검증 통과: 공용 문제 동시 요청·재사용, 보기 섞기, 정답 비공개, 계정 격리, 정오답·재도전, 버전 충돌, 누락·중복 거부, AI 없이 6문제 확인, 기존 문제 호환.");
    console.log("외부 서비스는 로컬 HTTP 모형이며, DB 권한·트랜잭션은 writing-word-order-database.sql로 별도 검증합니다.");
} finally { releaseGeneration(); await new Promise((resolve) => server.close(resolve)); }
