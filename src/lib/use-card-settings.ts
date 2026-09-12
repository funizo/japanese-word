"use client";

import { useSyncExternalStore } from "react";

type CardSettings = { meaning: boolean; word: boolean; reading: boolean };
const storageKey = "japanese-word:card-hidden-fields";
const defaults: CardSettings = { meaning: false, word: false, reading: false };
let settings = defaults;
let initialized = false;
const listeners = new Set<() => void>();

function parseSettings(value: string | null): CardSettings {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    if (!parsed || typeof parsed !== "object") return defaults;
    return {
      meaning: "meaning" in parsed && parsed.meaning === true,
      word: "word" in parsed && parsed.word === true,
      reading: "reading" in parsed && parsed.reading === true,
    };
  } catch {
    return defaults;
  }
}

function getSnapshot() {
  if (!initialized) {
    initialized = true;
    try {
      settings = parseSettings(localStorage.getItem(storageKey));
    } catch {
      // 저장소를 사용할 수 없어도 현재 화면에서 설정을 변경할 수 있습니다.
    }
  }
  return settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.storageArea === localStorage && (event.key === storageKey || event.key === null)) {
      settings = parseSettings(event.newValue);
      listeners.forEach((notify) => notify());
    }
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getServerSnapshot = () => defaults;

export function useCardSettings() {
  const hidden = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  function toggleHidden(field: keyof CardSettings) {
    const current = getSnapshot();
    settings = { ...current, [field]: !current[field] };
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch {
      // 저장 실패 시에도 이번 학습에서 선택한 설정은 유지합니다.
    }
    listeners.forEach((notify) => notify());
  }
  return { hidden, toggleHidden };
}
