import { AppShell } from "@/components/layout/app-shell";
import { WritingPractice } from "@/components/writing-practice";

export const metadata = { title: "일본어 작문 | 주분주분", description: "매일 10문장, N3 수준의 한국어 문장을 일본어로 써보고 풀이와 교정을 확인하세요." };

export default function WritingPage() {
    return <AppShell><WritingPractice /></AppShell>;
}
