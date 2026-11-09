export type StudyExample = { jp: string; reading: string; ko: string; reply: string; replyKo: string };
export type StudyVocabulary = { term: string; reading: string; meaning: string };
export type StudyLesson = {
  title: string; canonical: string; reading: string; meaning: string;
  category: string; rule: string; tip: string;
  vocabulary: StudyVocabulary[]; examples: StudyExample[];
};
export type StudyDay = { study_date: string; lessons: StudyLesson[]; created_at: string; model: string };
export type StudyHistory = { study_date: string; created_at: string };
export const studyScenes = ["다양한 일상", "친구와 대화", "식당과 카페", "여행과 길 찾기", "쇼핑"] as const;
export const dailyGenerationLimit = 10;

export function koreanDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** 전각·반각과 문장 부호 차이만 있는 용어도 같은 항목으로 취급합니다. */
export function termKey(term: string): string {
  return term.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

export function validStudyDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasText(value: Record<string, unknown>, limits: Record<string, number>): boolean {
  return Object.entries(limits).every(([key, max]) => typeof value[key] === "string" && Boolean(value[key].trim()) && value[key].length <= max);
}
export function parseExamples(value: unknown, count: number, previous: StudyExample[] = []): StudyExample[] {
  if (!Array.isArray(value) || value.length !== count) throw new Error("INVALID_AI_OUTPUT");
  const seen = new Set(previous.map((example) => termKey(example.jp)));
  for (const item of value) {
    if (!record(item) || !hasText(item, { jp: 180, reading: 240, ko: 240, reply: 180, replyKo: 240 })) throw new Error("INVALID_AI_OUTPUT");
    const key = termKey(item.jp as string);
    if (!key || seen.has(key)) throw new Error("DUPLICATE_AI_OUTPUT");
    seen.add(key);
  }
  return value as StudyExample[];
}

export function lessonTerms(lesson: StudyLesson): StudyVocabulary[] {
  const expression = { term: lesson.canonical, reading: lesson.reading, meaning: lesson.meaning };
  return [expression, ...(termKey(lesson.title) === termKey(lesson.canonical) ? [] : [{ ...expression, term: lesson.title }]), ...lesson.vocabulary];
}

export function parseLessons(value: unknown, previousKeys: Iterable<string>): StudyLesson[] {
  if (!record(value) || !Array.isArray(value.lessons) || value.lessons.length !== 5) throw new Error("INVALID_AI_OUTPUT");
  const seen = new Set(previousKeys);
  const examples: StudyExample[] = [];
  for (const lesson of value.lessons) {
    if (!record(lesson) || !hasText(lesson, { title: 100, canonical: 100, reading: 150, meaning: 180, category: 60, rule: 600, tip: 400 }) || !Array.isArray(lesson.vocabulary) || lesson.vocabulary.length !== 2) throw new Error("INVALID_AI_OUTPUT");
    for (const vocabulary of lesson.vocabulary) {
      if (!record(vocabulary) || !hasText(vocabulary, { term: 80, reading: 120, meaning: 180 })) throw new Error("INVALID_AI_OUTPUT");
    }
    for (const item of lessonTerms(lesson as StudyLesson)) {
      const key = termKey(item.term);
      if (!key || seen.has(key)) throw new Error("DUPLICATE_AI_OUTPUT");
      seen.add(key);
    }
    examples.push(...parseExamples(lesson.examples, 6, examples));
  }
  return value.lessons as StudyLesson[];
}
