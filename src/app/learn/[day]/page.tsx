import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { WordStudy } from "@/components/word-study";
import { days } from "@/lib/words";

export function generateStaticParams() {
  return days.map((day) => ({ day: day.id }));
}

export default async function Page({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  const dayIndex = days.findIndex((item) => item.id === day);
  if (dayIndex === -1) notFound();
  return <AppShell><WordStudy key={day} dayIndex={dayIndex} /></AppShell>;
}
