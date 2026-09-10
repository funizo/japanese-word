import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
const source = fs.readFileSync(new URL("../src/lib/words.ts", import.meta.url), "utf8");
const require = createRequire(import.meta.url);
const context = { exports: {}, require: createRequire(new URL("../src/lib/words.ts", import.meta.url)) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
const { parseSavedWords, swipeFeedback } = context.exports;
assert.equal(JSON.stringify(parseSavedWords(null)), "[]");
assert.equal(JSON.stringify(parseSavedWords('["kotoba","kotoba","unknown","tabi"]')), '["kotoba","tabi"]');
assert.throws(() => parseSavedWords('{"id":"kotoba"}'));
assert.throws(() => parseSavedWords('[123]'));
assert.throws(() => parseSavedWords('broken'));
console.log("Saved words checks passed.");
assert.equal(swipeFeedback(0, 400).opacity, 1);
assert.equal(swipeFeedback(70, 400).opacity, 0.94);
assert.equal(swipeFeedback(-70, 400).opacity, 0.94);
assert.equal(swipeFeedback(139, 400).action, null);
assert.equal(swipeFeedback(140, 400).action, "save");
assert.equal(swipeFeedback(-140, 400).action, "known");
assert.equal(swipeFeedback(140, 400).opacity, 0.88);
assert.equal(swipeFeedback(500, 400).opacity, 0.65);
assert.equal(swipeFeedback(160, 1000).action, "save");
console.log("Swipe threshold and opacity checks passed.");
assert.equal(swipeFeedback(0, 400).backgroundColor, "color-mix(in srgb, #15803d 0%, var(--card))");
assert.equal(swipeFeedback(-70, 400).backgroundColor, "color-mix(in srgb, #b91c1c 50%, var(--card))");
assert.equal(swipeFeedback(70, 400).backgroundColor, "color-mix(in srgb, #15803d 50%, var(--card))");
assert.equal(swipeFeedback(-500, 400).backgroundColor, "color-mix(in srgb, #b91c1c 100%, var(--card))");
assert.equal(swipeFeedback(500, 400).backgroundColor, "color-mix(in srgb, #15803d 100%, var(--card))");
console.log("Directional background color checks passed.");

// Exercise preview actions with storage access forbidden, including repeated clicks.
const states = [];
let cursor = 0;
let previewMode = true;
let stored = "[]";
const componentContext = {
  exports: {},
  require(name) {
    if (name === "@/lib/words") return context.exports;
    if (name === "@/components/speech-button") return { SpeechButton: "speech-button" };
    if (name === "next/link") return { default: "a" };
    if (name === "react") return {
      useId: () => "preview-test",
      useRef: () => ({ current: null }),
      useEffect: (effect) => effect(),
      useState(initial) {
        const slot = cursor++;
        if (!(slot in states)) states[slot] = initial;
        return [states[slot], (next) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
      },
    };
    return require(name);
  },
  get localStorage() {
    if (previewMode) assert.fail("Preview must not access storage");
    return { getItem: () => stored, setItem: (key, value) => { stored = value; } };
  },
  window: { addEventListener() {}, removeEventListener() {} },
};
const componentSource = fs.readFileSync(new URL("../src/components/word-study.tsx", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(componentSource, { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, componentContext);
function flatten(node) {
  if (Array.isArray(node)) return node.flatMap(flatten);
  return node && typeof node === "object" ? [node, ...flatten(node.props?.children)] : [node];
}
for (let attempt = 0; attempt < 12; attempt++) {
  cursor = 0;
  const nodes = flatten(componentContext.exports.WordStudy({ preview: true }));
  assert.ok(nodes.includes("言葉"));
  assert.ok(nodes.includes("미리보기 · 1 / 1"));
  assert.ok(!nodes.includes("桜"));
  const buttons = nodes.filter((node) => node?.type === "button");
  assert.equal(buttons[1].props.disabled, false);
  buttons[attempt % 2].props.onClick();
}
console.log("Preview repeats one word without accessing storage.");

const { days } = context.exports;
assert.equal(days.length, 20);
assert.equal(new Set(days.flatMap((day) => day.words.map((word) => word.id))).size, 1000);
for (const [index, day] of days.entries()) {
  assert.equal(day.id, `day${String(index + 1).padStart(2, "0")}`);
  assert.equal(day.words.length, 50);
  for (const word of day.words) {
    for (const field of ["text", "reading", "meaning", "example", "translation"]) assert.ok(word[field].trim());
  }
}
assert.equal(JSON.stringify(parseSavedWords('["day01-01","day20-50","day01-01","unknown"]')), '["day01-01","day20-50"]');
previewMode = false;
states.length = 0;
let selectedDay = 0;
function renderStudy(props = {}) {
  cursor = 0;
  return flatten(componentContext.exports.WordStudy({ dayIndex: selectedDay, ...props }));
}
renderStudy();
let nodes = renderStudy();
assert.equal(nodes.filter((node) => node?.type === "select").length, 0);
assert.ok(nodes.some((node) => node?.props?.href === "/learn"));
assert.ok(nodes.includes(days[0].words[0].text));
assert.ok(nodes.includes(days[0].words[0].example));
assert.ok(nodes.includes(days[0].words[0].translation));
selectedDay = 19;
states.length = 0; // A different route key mounts a fresh study session.
renderStudy();
nodes = renderStudy();
assert.ok(nodes.includes("Day 20 · 1 / 50"));
assert.ok(nodes.includes(days[19].words[0].example));
assert.ok(nodes.includes(days[19].words[0].translation));
nodes.filter((node) => node?.type === "button")[1].props.onClick();
assert.equal(stored, '["day20-01"]');
assert.ok(renderStudy().includes("Day 20 · 2 / 50"));
for (let i = 1; i < 50; i++) renderStudy().find((node) => node?.type === "button").props.onClick();
assert.ok(!renderStudy().some((node) => node?.props?.onPointerDown));
assert.ok(!renderStudy().some((node) => node?.props?.href === "/learn/day21"));
selectedDay = 0;
states.length = 0;
renderStudy();
assert.ok(renderStudy().includes("Day 01 · 1 / 50"));
for (let i = 0; i < 50; i++) renderStudy().find((node) => node?.type === "button").props.onClick();
assert.ok(renderStudy().some((node) => node?.props?.href === "/learn/day02"));
selectedDay = 1;
states.length = 0;
renderStudy();
assert.ok(renderStudy().includes("Day 02 · 1 / 50"));
assert.ok(renderStudy({ savedOnly: true }).includes(days[19].words[0].text));
assert.ok(renderStudy({ savedOnly: true }).includes(days[19].words[0].example));
assert.ok(renderStudy({ savedOnly: true }).includes(days[19].words[0].translation));
console.log("20 days / 1,000 words, day switching, completion, and saved words checks passed.");

function loadPage(path) {
  const pageContext = { exports: {}, require(name) {
    if (name === "@/lib/words") return context.exports;
    if (name === "@/components/layout/app-shell") return { AppShell: "app-shell" };
    if (name === "@/components/word-study") return { WordStudy: "word-study" };
    if (name === "next/link") return { default: "a" };
    if (name === "next/navigation") return { notFound() { throw new Error("404"); } };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, pageContext);
  return pageContext.exports;
}
const cards = flatten(loadPage("../src/app/learn/page.tsx").default());
const studyPage = loadPage("../src/app/learn/[day]/page.tsx");
assert.equal(studyPage.generateStaticParams().length, 20);
for (const [index, day] of days.entries()) {
  assert.ok(cards.some((node) => node?.props?.href === `/learn/${day.id}`));
  const page = await studyPage.default({ params: Promise.resolve({ day: day.id }) });
  const study = flatten(page).find((node) => node?.type === "word-study");
  assert.equal(study.props.dayIndex, index);
  assert.equal(study.key, day.id);
}
await assert.rejects(studyPage.default({ params: Promise.resolve({ day: "day21" }) }), /404/);
console.log("20 day cards, matching routes, and invalid day checks passed.");
