"use client";

import { useEffect, useState } from "react";

export function HiddenStudyText({
    text,
    label,
    lang,
    placeholderClassName,
}: {
    text: string;
    label: string;
    lang?: string;
    placeholderClassName?: string;
}) {
    const [revealed, setRevealed] = useState(false);

    useEffect(() => {
        if (!revealed) return;
        const timer = window.setTimeout(() => setRevealed(false), 1000);
        return () => window.clearTimeout(timer);
    }, [revealed]);

    return (
        <button
            type="button"
            className="min-h-11 max-w-full cursor-pointer rounded-lg break-words"
            aria-label={`${label} ${revealed ? "다시 숨기기" : "1초 동안 보기"}`}
            aria-pressed={revealed}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.stopPropagation();
                setRevealed((current) => !current);
            }}
        >
            <span
                aria-live="polite"
                lang={revealed ? lang : undefined}
                className={revealed ? undefined : placeholderClassName}
            >
                {revealed ? text : `${label} 숨김`}
            </span>
        </button>
    );
}
