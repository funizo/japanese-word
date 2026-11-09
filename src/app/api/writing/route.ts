import { koreanDate, validStudyDate } from "@/lib/ai-study";
import { readStudyBody, StudyError, studyClient, studyFailure, studyResponse } from "@/lib/ai-study-server";
import { parseWritingAnswers } from "@/lib/writing";
import { gradeWriting, prepareWriting, writingCommand, writingSnapshot } from "@/lib/writing-server";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(request: Request) {
  try {
    const { client } = await studyClient(request, "일본어 작문");
    const date = new URL(request.url).searchParams.get("date") ?? koreanDate();
    if (!validStudyDate(date) || date > koreanDate()) throw new StudyError("학습 날짜를 확인해 주세요.", 400);
    return studyResponse(await writingSnapshot(client, date));
  } catch (error) { return studyFailure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await readStudyBody(request, 32768);
    const { client } = await studyClient(request, "일본어 작문");
    if (body.action === "prepare") return studyResponse(await prepareWriting(client));
    if (body.action !== "save" && body.action !== "grade") throw new StudyError("지원하지 않는 작문 요청이에요.", 400);
    if (typeof body.date !== "string" || !validStudyDate(body.date) || body.date > koreanDate()) throw new StudyError("학습 날짜를 확인해 주세요.", 400);
    let answers;
    try { answers = parseWritingAnswers(body.answers); } catch { throw new StudyError("답안은 문항별 600자까지 입력할 수 있어요. 문항과 답안 내용을 확인해 주세요.", 400); }
    if (body.action === "save") {
      await writingCommand(client, "save", { date: body.date, answers });
      return studyResponse(await writingSnapshot(client, body.date));
    }
    if (!answers.some((item) => item.answer.trim())) throw new StudyError("한 문장 이상 작성한 뒤 채점해 주세요.", 400);
    return studyResponse(await gradeWriting(client, body.date, answers));
  } catch (error) { return studyFailure(error); }
}
