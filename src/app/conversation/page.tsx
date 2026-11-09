import { AppShell } from "@/components/layout/app-shell";
import { ConversationStudy } from "@/components/conversation-study";

export const metadata = { title: "AI 회화 학습 | 주분주분" };

export default function ConversationPage() {
  return <AppShell><ConversationStudy /></AppShell>;
}
