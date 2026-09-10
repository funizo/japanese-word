"use client";

import { useEffect, useRef, useState } from "react";

export function SpeechButton({ text, label }: { text: string; label: string }) {
  const [message, setMessage] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => {
      if (utterance.current) {
        utterance.current.onend = null;
        utterance.current.onerror = null;
        window.speechSynthesis?.cancel();
        utterance.current = null;
      }
    };
  }, [text]);

  function speak() {
    setMessage("");
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setMessage("이 브라우저는 음성 재생을 지원하지 않아요.");
      return;
    }
    try {
      const synth = window.speechSynthesis;
      const voices = synth.getVoices();
      const voice = voices.find((item) => /^ja(?:[-_]|$)/i.test(item.lang));
      if (voices.length && !voice) {
        setMessage("기기 설정에서 일본어 음성을 설치한 뒤 다시 시도해 주세요.");
        return;
      }
      synth.cancel();
      const speech = new window.SpeechSynthesisUtterance(text);
      speech.lang = "ja-JP";
      speech.rate = 0.85;
      if (voice) speech.voice = voice;
      utterance.current = speech;
      speech.onend = () => {
        if (utterance.current === speech) utterance.current = null;
      };
      speech.onerror = (event) => {
        if (utterance.current !== speech) return;
        utterance.current = null;
        if (event.error !== "interrupted" && event.error !== "canceled") {
          setMessage("재생하지 못했어요. 일본어 음성 설정과 네트워크를 확인해 주세요.");
        }
      };
      synth.speak(speech);
    } catch {
      utterance.current = null;
      setMessage("음성 재생을 시작하지 못했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <span className="mt-2 inline-flex flex-col items-center gap-1">
      <button
        type="button"
        className="min-h-11 cursor-pointer rounded-lg border border-current/30 px-3 py-2 text-sm hover:bg-current/10"
        aria-label={`${label}: ${text}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={speak}
      >
        <span aria-hidden="true">🔊</span> {label}
      </button>
      <span role="status" className="text-xs leading-5">
        {message}
      </span>
    </span>
  );
}
