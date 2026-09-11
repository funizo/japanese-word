import day01 from "../data/words/day01.json";
import day02 from "../data/words/day02.json";
import day03 from "../data/words/day03.json";
import day04 from "../data/words/day04.json";
import day05 from "../data/words/day05.json";
import day06 from "../data/words/day06.json";
import day07 from "../data/words/day07.json";
import day08 from "../data/words/day08.json";
import day09 from "../data/words/day09.json";
import day10 from "../data/words/day10.json";
import day11 from "../data/words/day11.json";
import day12 from "../data/words/day12.json";
import day13 from "../data/words/day13.json";
import day14 from "../data/words/day14.json";
import day15 from "../data/words/day15.json";
import day16 from "../data/words/day16.json";
import day17 from "../data/words/day17.json";
import day18 from "../data/words/day18.json";
import day19 from "../data/words/day19.json";
import day20 from "../data/words/day20.json";

const legacyWords = [
  { id: "kotoba", text: "言葉", reading: "ことば", meaning: "말, 언어" },
  { id: "sakura", text: "桜", reading: "さくら", meaning: "벚꽃" },
  { id: "tabi", text: "旅", reading: "たび", meaning: "여행" },
  { id: "mainichi", text: "毎日", reading: "まいにち", meaning: "매일" },
  { id: "tomodachi", text: "友達", reading: "ともだち", meaning: "친구" },
];
export const previewWord = { ...legacyWords[0], example: "", translation: "" };
export const days = [day01, day02, day03, day04, day05, day06, day07, day08, day09, day10, day11, day12, day13, day14, day15, day16, day17, day18, day19, day20].map((day, dayIndex) => ({
  id: day.day,
  label: `Day ${String(dayIndex + 1).padStart(2, "0")}`,
  words: day.words.map((word, index) => ({
    id: `${day.day}-${String(index + 1).padStart(2, "0")}`,
    text: word.word,
    reading: word.furigana,
    meaning: word.mean,
    day: day.day,
    example: word.exampleSentence,
    translation: word.exampleSentenceMean,
  })),
}));
// 실제 데이터로 바꾼 뒤에도 예전에 저장한 예시 단어를 읽을 수 있게 유지합니다.
export const words = [...days.flatMap((day) => day.words), ...legacyWords.map((word) => ({ ...word, day: "예시", example: "", translation: "" }))];
export function parseSavedWords(value: string | null): string[] {
  const parsed: unknown = JSON.parse(value ?? "[]");
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) throw new Error("저장한 단어 형식이 올바르지 않아요.");
  return [...new Set(parsed)].filter((id) => words.some((word) => word.id === id));
}

export function swipeFeedback(distance: number, width: number) {
  const progress = distance / Math.max(1, Math.min(width * 0.35, 160));
  return {
    opacity: Math.max(0.65, 1 - Math.abs(progress) * 0.12),
    backgroundColor: `color-mix(in srgb, ${distance < 0 ? "#b91c1c" : "#15803d"} ${Math.min(1, Math.abs(progress)) * 100}%, var(--card))`,
    action: progress <= -1 ? "known" : progress >= 1 ? "save" : null,
  };
}
