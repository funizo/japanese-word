import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// 브라우저 없이 훅의 비동기 저장 결과와 실제 카드 버튼 이벤트를 검사합니다.
const require = createRequire(import.meta.url);
function load(file, overrides = {}) {
  const filename = path.resolve(file);
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded.require = (name) => Object.hasOwn(overrides, name) ? overrides[name] : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
  return loaded.exports;
}

function hookRuntime() {
  const slots = [];
  let position = 0;
  let pending = [];
  return {
    react: {
      ...React,
      useState(initial) {
        const slot = position++;
        if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
        return [slots[slot], (next) => { slots[slot] = typeof next === "function" ? next(slots[slot]) : next; }];
      },
      useRef(initial) {
        const slot = position++;
        slots[slot] ??= { current: initial };
        return slots[slot];
      },
      useId: () => "검증용-카드",
      useEffect(effect, deps) {
        const slot = position++;
        if (slots[slot]?.deps.every((value, index) => Object.is(value, deps[index]))) return;
        pending.push(() => {
          slots[slot]?.cleanup?.();
          slots[slot] = { deps, cleanup: effect() };
        });
      },
    },
    render(callback) {
      position = 0;
      const result = callback();
      const effects = pending;
      pending = [];
      effects.forEach((effect) => effect());
      return result;
    },
    cleanup() { slots.forEach((slot) => slot?.cleanup?.()); },
  };
}

const ids = ["day01-01", "day01-02", "day01-03"];
const storage = new Map([["japanese-word:saved", JSON.stringify(ids.slice(0, 2))]]);
const listeners = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
globalThis.window = {
  addEventListener: (name, listener) => listeners.set(name, listener),
  removeEventListener: (name) => listeners.delete(name),
};
const parseSavedWords = (value) => [...new Set(JSON.parse(value ?? "[]"))].filter((id) => ids.includes(id));
let auth = { user: null, loading: false, error: "" };
const db = new Map([
  ["계정-A", new Map([[ids[1], true]])],
  ["계정-B", new Map([[ids[2], false]])],
]);
let failStar = false;
let finishStar;
let starCalls = 0;
const hook = hookRuntime();
const { useSavedWords } = load("src/lib/use-saved-words.ts", {
  react: hook.react,
  "@/components/auth-provider": { useAuth: () => auth },
  "@/lib/words": { parseSavedWords },
  "@/lib/supabase/client": { getSupabaseClient: () => ({}) },
  "@/lib/supabase/saved-words": {
    loadSavedWords: async (_client, owner) => [...db.get(owner)].map(([word_id, is_starred]) => ({ word_id, is_starred })),
    saveWords: async (_client, owner, values) => values.forEach((id) => { if (!db.get(owner).has(id)) db.get(owner).set(id, false); }),
    removeSavedWord: async (_client, owner, id) => { db.get(owner).delete(id); },
    setSavedWordsStarred: async (_client, owner, values, starred) => {
      starCalls++;
      if (failStar) throw new Error("검증용 저장 실패");
      if (finishStar) await new Promise((resolve) => { finishStar = resolve; });
      values.forEach((id) => db.get(owner).set(id, starred));
    },
  },
});
const renderHook = () => hook.render(() => useSavedWords(true));
const settle = () => new Promise((resolve) => setImmediate(resolve));
let state = renderHook();
state = renderHook();
assert.equal(state.ready, true);
assert.deepEqual(state.starred, []);
assert.equal(await state.updateStarred(ids[0], true), true);
state = renderHook();
assert.deepEqual(state.starred, [ids[0]]);
await state.reload();
state = renderHook();
assert.deepEqual(state.starred, [ids[0]], "브라우저 저장에서 다시 불러와도 별표를 유지합니다");
assert.equal(await state.updateStarred(ids[0], false), true);
state = renderHook();
assert.deepEqual(state.saved, ids.slice(0, 2));
assert.deepEqual(state.starred, []);
assert.equal(await state.updateStarred(ids[2], true), false, "저장하지 않은 단어에는 별표를 표시하지 않습니다");
assert.equal(await state.updateStarred(ids[0], true), true);
state = renderHook();
assert.equal(await state.updateSaved(ids[0], true), true);
state = renderHook();
assert.deepEqual(state.starred, [], "단어 삭제 시 별표도 제거합니다");
assert.equal(await state.updateSaved(ids[0]), true);
state = renderHook();
assert.deepEqual(state.starred, [], "삭제 후 다시 저장한 단어에 과거 별표가 복원되지 않습니다");
await state.updateStarred(ids[0], true);

auth = { ...auth, user: { id: "계정-A" } };
assert.deepEqual(renderHook().saved, [], "계정 전환 중 이전 브라우저 기록을 노출하지 않습니다");
await settle();
state = renderHook();
assert.deepEqual(state.starred, [ids[1]]);
assert.equal(await state.importLocal(), true);
state = renderHook();
assert.deepEqual([...state.starred].sort(), ids.slice(0, 2));
await state.reload();
state = renderHook();
assert.deepEqual([...state.starred].sort(), ids.slice(0, 2), "가져온 별표와 기존 계정 별표가 모두 저장됩니다");
failStar = true;
assert.equal(await state.updateStarred(ids[0], false), false);
state = renderHook();
assert.equal(state.starred.includes(ids[0]), true, "저장 실패 시 성공한 것처럼 별표를 바꾸지 않습니다");
assert.match(state.error, /별표 변경/);
failStar = false;
finishStar = true;
const beforeCalls = starCalls;
const pendingStar = state.updateStarred(ids[0], false);
assert.equal(await state.updateStarred(ids[0], false), false);
assert.equal(starCalls, beforeCalls + 1, "처리 중 중복 요청을 차단합니다");
auth = { ...auth, user: { id: "계정-B" } };
renderHook();
await settle();
finishStar();
await pendingStar;
state = renderHook();
assert.deepEqual(state.saved, [ids[2]]);
assert.deepEqual(state.starred, [], "이전 계정의 늦은 저장 응답이 새 계정 상태를 바꾸지 않습니다");
hook.cleanup();

// 컴포넌트의 필터와 별표 이벤트를 실제 렌더링 트리에서 실행합니다.
const ui = hookRuntime();
const model = {
  saved: ids.slice(0, 2), starred: [ids[1]], ready: true, busy: false, error: "", account: true,
  updateStarred: async (id, value) => {
    model.starred = value ? [...new Set([...model.starred, id])] : model.starred.filter((item) => item !== id);
    return true;
  },
};
const testWords = ids.map((id, index) => ({ id, text: `단어${index + 1}`, reading: "발음", meaning: "뜻", example: "", translation: "" }));
const { WordStudy } = load("src/components/word-study.tsx", {
  react: ui.react,
  "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  "@/lib/words": { words: testWords, days: [{ words: testWords }], swipeFeedback: () => ({ opacity: 1 }) },
  "@/lib/use-saved-words": { useSavedWords: () => model },
  "@/lib/use-card-settings": { useCardSettings: () => ({ hidden: {}, toggleHidden: () => {} }) },
  "@/lib/use-study-progress": { useStudyProgress: () => ({}) },
  "@/components/speech-button": { SpeechButton: () => null },
  "@/components/hidden-study-text": { HiddenStudyText: () => null },
});
function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement(node)) return [];
  return [node, ...elements(node.props.children)];
}
const renderUI = () => ui.render(() => WordStudy({ savedOnly: true }));
let tree = renderUI();
const button = (match) => {
  const found = elements(tree).find((item) => item.type === "button" && match(item.props));
  assert.ok(found, "검증할 카드 버튼이 있어야 합니다");
  return found.props;
};
assert.match(renderToStaticMarkup(tree), /단어1/);
await button((props) => props["aria-label"] === "빨리 외울 단어로 별표 표시").onClick();
tree = renderUI();
assert.equal(button((props) => props["aria-label"] === "빨리 외울 단어 별표 해제")["aria-pressed"], true);
button((props) => String(props.children).includes("★ 별표한 단어")).onClick();
tree = renderUI();
await button((props) => props["aria-label"] === "빨리 외울 단어 별표 해제").onClick();
tree = renderUI();
assert.match(renderToStaticMarkup(tree), /단어2/);
assert.doesNotMatch(renderToStaticMarkup(tree), /단어1/);
await button((props) => props["aria-label"] === "빨리 외울 단어 별표 해제").onClick();
tree = renderUI();
assert.match(renderToStaticMarkup(tree), /아직 별표한 단어가 없어요/);
assert.equal(model.saved.length, 2, "별표 해제는 단어를 삭제하지 않습니다");
button((props) => props.children === "전체 단어 보기").onClick();
tree = renderUI();
assert.match(renderToStaticMarkup(tree), /단어1/);
console.log("별표 검증 통과: 브라우저·계정 저장, 가져오기, 실패·중복·계정 전환 처리, 카드 버튼과 필터, 빈 목록");
