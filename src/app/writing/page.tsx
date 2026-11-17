import { AppShell } from "@/components/layout/app-shell";
import { WritingPractice } from "@/components/writing-practice";

export const metadata = { title: "일본어 작문 | 주분주분", description: "매일 10문장, N3 수준의 일본어 단어를 올바른 순서로 조합하고 정답과 문법 풀이를 확인하세요." };

export default function WritingPage() {
    return <AppShell><WritingPractice /></AppShell>;
}
