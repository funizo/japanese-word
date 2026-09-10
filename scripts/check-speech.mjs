import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let message = "";
let cleanup;
let voices = [{ lang: "en-US" }, { lang: "ja-JP" }];
const ref = { current: null };
const calls = [];
const browser = {
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  speechSynthesis: {
    getVoices: () => voices,
    cancel: () => calls.push("cancel"),
    speak: (speech) => calls.push(speech),
  },
};
const context = {
  exports: {}, window: browser,
  require: (name) => name === "react" ? {
    useState: () => [message, (value) => { message = value; }],
    useRef: () => ref,
    useEffect: (effect) => { cleanup = effect(); },
  } : require(name),
};
const source = fs.readFileSync(new URL("../src/components/speech-button.tsx", import.meta.url), "utf8");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
const tree = context.exports.SpeechButton({ text: "あいさつ", label: "단어 듣기" });
const button = tree.props.children[0];
let stopped = false;
button.props.onPointerDown({ stopPropagation() { stopped = true; } });
assert.ok(stopped);
button.props.onClick();
assert.equal(calls[0], "cancel");
assert.equal(calls[1].text, "あいさつ");
assert.equal(calls[1].lang, "ja-JP");
assert.equal(calls[1].rate, 0.85);
assert.equal(calls[1].voice, voices[1]);
calls[1].onerror({ error: "interrupted" });
assert.equal(message, "");
voices = [{ lang: "en-US" }];
button.props.onClick();
assert.ok(message.includes("일본어 음성"));
assert.equal(calls.length, 2);
voices = []; // Some browsers load their voice list asynchronously.
button.props.onClick();
assert.equal(calls.at(-1).lang, "ja-JP");
calls.at(-1).onerror({ error: "language-unavailable" });
assert.ok(message.includes("재생하지 못했어요"));
button.props.onClick();
cleanup();
assert.equal(calls.at(-1), "cancel");
assert.equal(ref.current, null);
delete browser.speechSynthesis;
button.props.onClick();
assert.ok(message.includes("지원하지 않아요"));
console.log("Japanese speech, cancellation, unavailable voices, errors, and drag isolation checks passed.");
