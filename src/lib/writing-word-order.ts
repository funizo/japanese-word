// 띄어쓰기와 문장부호는 단어 배열의 정오답에 영향을 주지 않습니다.
export function normalizeWritingSentence(sentence: string) {
  return sentence.normalize("NFKC").replace(/[\s。、，,.!?！？]/gu, "");
}

export function writingTokens(reference: string, tokens?: string[]): string[] {
  if (tokens?.length && tokens.every((token) => token.trim() && !/\s/u.test(token)) && normalizeWritingSentence(tokens.join("")) === normalizeWritingSentence(reference)) return tokens;

  // 기존 자유 작문 문제도 추가 생성 없이 단어 배열 문제로 복습할 수 있습니다.
  const segments = new Intl.Segmenter("ja", { granularity: "word" }).segment(reference);
  const words: string[] = [];
  const suffixes = new Set(["は", "が", "を", "に", "で", "と", "も", "の", "へ", "や", "から", "まで", "より", "て", "た", "だ", "です", "ます", "まし", "ませ", "ん", "ない", "なかっ", "いる", "い", "れる", "られる", "な"]);
  for (const { segment } of segments) {
    const word = segment.replace(/[\s。、，,.!?！？]/gu, "");
    if (!word) continue;
    if (words.length && suffixes.has(word)) words[words.length - 1] += word;
    else words.push(word);
  }
  return words;
}

export function shuffleWritingTokens(tokens: string[], seed: string): string[] {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  const shuffled = [...tokens];
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const target = state % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled.every((word, index) => word === tokens[index])) shuffled.push(shuffled.shift()!);
  return shuffled;
}

// 같은 단어가 여러 번 나와도 각각의 칩을 한 번씩만 사용합니다.
export function restoreWritingSelection(words: string[], answer: string): number[] | null {
  if (!answer.trim()) return [];
  const pieces = answer.trim().split(/\s+/u);
  if (pieces.length > 1) {
    const selected: number[] = [];
    for (const piece of pieces) {
      const index = words.findIndex((word, index) => word === piece && !selected.includes(index));
      if (index < 0) return null;
      selected.push(index);
    }
    return selected;
  }
  // 이전에 띄어쓰기 없이 저장한 일본어 답안도 가능한 경우 복원합니다.
  const target = normalizeWritingSentence(answer);
  const tokens = words.map(normalizeWritingSentence);
  let budget = 5000;
  function find(offset: number, selected: number[]): number[] | null {
    if (offset === target.length) return selected;
    if (--budget < 0) return null;
    const tried = new Set<string>();
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index];
      if (!token || selected.includes(index) || tried.has(token) || !target.startsWith(token, offset)) continue;
      tried.add(token);
      const found = find(offset + token.length, [...selected, index]);
      if (found) return found;
    }
    return null;
  }
  return find(0, []);
}
