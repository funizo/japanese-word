/** 예전 자료에 섞여 있는 예문도 원문·읽기·번역별로 나누어 보여줍니다. */
function ExplanationLine({ text, label }: { text: string; label: string }) {
    const parts = text.trim().split(/\s+[—–]\s+/u);
    const original = parts.shift() ?? "";
    const translation = parts.join(" — ");
    const reading = original.match(/[\[［]([^\]］]+)[\]］]\s*$/u);
    const japanese = reading
        ? original.slice(0, reading.index).trim()
        : original;

    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold text-accent">{label}</p>
            <p lang="ja" className="break-words text-base leading-8 text-ink">
                {japanese}
            </p>
            {reading && (
                <p lang="ja" className="break-words text-sm leading-7 text-muted">
                    {reading[1]}
                </p>
            )}
            {translation && (
                <p className="break-words text-sm leading-7 text-muted">
                    {translation}
                </p>
            )}
        </div>
    );
}

export function StudyExplanation({ text }: { text: string }) {
    const blocks = text
        .replace(/\r\n?/gu, "\n")
        .split(/\n\s*\n|\s*(?=\d+[.)]\s*(?:jp|예문)\s*[:：])/giu)
        .map((block) => block.trim())
        .filter(Boolean);

    return (
        <div className="mt-4 space-y-4">
            {blocks.map((block, index) => {
                const example = block.match(
                    /^(\d+)[.)]\s*(?:jp|예문)\s*[:：]\s*([\s\S]+)$/iu,
                );
                if (example) {
                    const [utterance, ...replies] = example[2].split(
                        /\s*\/\s*reply\s*[:：]\s*/iu,
                    );
                    return (
                        <div
                            key={index}
                            className="space-y-4 rounded-2xl border border-line bg-canvas p-4 sm:p-5"
                        >
                            <ExplanationLine
                                text={utterance}
                                label={`활용 예문 ${example[1]}`}
                            />
                            {replies.length > 0 && (
                                <div className="border-t border-line pt-4">
                                    <ExplanationLine
                                        text={replies.join(" / reply: ")}
                                        label="상대방의 답변"
                                    />
                                </div>
                            )}
                        </div>
                    );
                }

                // 번호가 붙은 예문 앞의 중복 제목은 예문 카드의 제목으로 대체합니다.
                const paragraph = block.replace(/\s*예문\s*[:：]\s*$/u, "").trim();
                return paragraph ? (
                    <p
                        key={index}
                        className="whitespace-pre-line break-words text-[0.9375rem] leading-8 text-ink"
                    >
                        {paragraph}
                    </p>
                ) : null;
            })}
        </div>
    );
}
