import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

// 공용 문제를 변경할 수 있는 권한은 이 기능 전용 증명으로 제한합니다.
// 비밀값은 파일에만 저장하고 DB 등록용 해시만 출력합니다.
const target = path.resolve(".env.local");
if (fs.lstatSync(target).isSymbolicLink()) throw new Error("환경변수 파일의 심볼릭 링크는 사용할 수 없습니다.");
const tracked = execFileSync("git", ["ls-files", "--", ".env.local"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
if (tracked) throw new Error("Git에서 추적 중인 파일에는 비밀값을 저장할 수 없습니다.");
let content = fs.readFileSync(target, "utf8");
const current = content.match(/^WRITING_SERVER_SECRET\s*=\s*(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
const secret = current || randomBytes(32).toString("hex");
if (secret.length < 32) throw new Error("서버 전용 증명이 너무 짧습니다.");
if (!current) {
  content = content.replace(/^WRITING_SERVER_SECRET\s*=.*\r?\n?/gm, "");
  fs.writeFileSync(target, `${content.trimEnd()}\nWRITING_SERVER_SECRET=${secret}\n`);
}
console.log(JSON.stringify({ target, envName: "WRITING_SERVER_SECRET", secretHash: createHash("sha256").update(secret).digest("hex") }));
