import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { WordPreview } from "@/components/word-preview";

export default function Home() {
    return (
        <AppShell>
            <section className="grid items-center gap-12 lg:grid-cols-2">
                <div>
                    <p className="eyebrow">10분이면 충분.</p>
                    <h1 className="mt-5 text-4xl leading-tight font-bold tracking-tight sm:text-6xl">
                        10分,十分
                        <br />
                        <span className="text-accent">일본어 습관.</span>
                    </h1>
                    <p className="mt-6 text-lg leading-8 text-muted">
                        외우고, 저장하고, 다시 만나세요.
                        <br />
                        나만의 속도로 일본어 단어를 차곡차곡 쌓아가요.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link className="primary-button" href="/learn">
                            단어 학습 시작하기 →
                        </Link>
                        {/* <Link className="secondary-button" href="/signup">
              회원가입
            </Link> */}
                    </div>
                    <p className="mt-4 text-sm text-muted">
                        회원가입 없이도 예시 단어를 학습할 수 있어요.
                    </p>
                </div>
                <WordPreview />
            </section>
            <section className="mt-16 border-t border-line pt-10">
                <p className="eyebrow">HOW IT WORKS</p>
                <h2 className="mt-3 text-2xl font-bold">
                    가볍게 시작하고, 꾸준히 기억해요
                </h2>
                <div className="mt-7 grid gap-4 md:grid-cols-3">
                    {[
                        [
                            "01",
                            "한 장씩 배우기",
                            "단어 카드로 발음과 뜻을 익혀요.",
                            "/learn",
                        ],
                        [
                            "02",
                            "내 단어장에 담기",
                            "다시 보고 싶은 단어를 저장해요.",
                            "/saved",
                        ],
                        [
                            "03",
                            "나만의 학습 시작하기",
                            "계정을 만들고 일본어 공부를 시작해요.",
                            "/signup",
                        ],
                    ].map(([number, title, description, href]) => (
                        <Link
                            key={number}
                            href={href}
                            className="panel hover:border-accent"
                        >
                            <span className="text-sm text-accent">
                                {number}
                            </span>
                            <h3 className="mt-5 text-lg font-bold">{title}↗</h3>
                            <p className="mt-2 text-muted">{description}</p>
                        </Link>
                    ))}
                </div>
            </section>
        </AppShell>
    );
}
