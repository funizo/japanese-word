import { koreanDate, studyScenes, validStudyDate } from "@/lib/ai-study";
import { checkDatabase, generateStudy, readStudyBody, readStudyDay, StudyError, studyClient, studyFailure, studyResponse } from "@/lib/ai-study-server";

export const runtime = "nodejs";
export const maxDuration = 240;

export async function GET(request: Request) {
  try {
    const { client, userId } = await studyClient(request);
    const today = koreanDate();
    const date = new URL(request.url).searchParams.get("date") ?? today;
    if (!validStudyDate(date) || date > today) throw new StudyError("학습 날짜를 확인해 주세요.", 400);
    const [entry, progress, usage] = await Promise.all([
      readStudyDay(client, userId, date),
      client.from("ai_study_progress").select("lesson_index").eq("user_id", userId).eq("study_date", date),
      client.from("ai_generation_requests").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("study_date", today),
    ]);
    checkDatabase(progress.error);
    checkDatabase(usage.error);
    const history: { study_date: string; created_at: string }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("ai_study_days").select("study_date,created_at").eq("user_id", userId).order("study_date", { ascending: false }).range(offset, offset + 999);
      checkDatabase(error);
      history.push(...data!);
      if (data!.length < 1000) break;
    }
    return studyResponse({ entry, history, completed: progress.data!.map((row) => row.lesson_index), today, used: usage.count ?? 0 });
  } catch (error) { return studyFailure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readStudyBody(request);
    const { client, userId } = await studyClient(request);
    if (body.action === "generate") return studyResponse(await generateStudy(client, userId, "daily"));
    const date = body.date;
    const index = body.index;
    if (typeof date !== "string" || !validStudyDate(date) || date > koreanDate() || !Number.isInteger(index) || (index as number) < 0 || (index as number) > 4) throw new StudyError("학습 날짜와 표현을 확인해 주세요.", 400);
    if (body.action === "more") {
      if (!studyScenes.includes(body.scene as typeof studyScenes[number])) throw new StudyError("연습할 상황을 선택해 주세요.", 400);
      return studyResponse(await generateStudy(client, userId, "more", { date, index: index as number, scene: body.scene as string }));
    }
    if (body.action === "complete") {
      if (!(await readStudyDay(client, userId, date))) throw new StudyError("저장된 학습 자료를 찾을 수 없어요.", 404);
      const { error } = await client.from("ai_study_progress").upsert({ user_id: userId, study_date: date, lesson_index: index as number }, { onConflict: "user_id,study_date,lesson_index", ignoreDuplicates: true });
      checkDatabase(error);
      return studyResponse({ completed: index });
    }
    throw new StudyError("지원하지 않는 학습 요청이에요.", 400);
  } catch (error) { return studyFailure(error); }
}
