import { after } from "next/server";
import { z } from "zod";
import { questionPlanSchema } from "@/lib/ai/schemas/plan";
import { turnRecordSchema } from "@/lib/interview/types";
import { jsonError, readJson } from "@/lib/poc/access";
import { practiceFailure, requirePractice } from "@/lib/practice-link/access";
import { evaluatePractice } from "@/lib/practice-link/evaluate";
import { interviewerVoices } from "@/lib/speech/interviewer-voice";
export const maxDuration = 300;
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), requestId: z.uuid(), answerBy: z.enum(["voice", "text"]) }),
  z.object({ action: z.literal("retry"), sessionId: z.uuid() }),
  z.object({ action: z.literal("finish"), sessionId: z.uuid(), history: z.array(turnRecordSchema.omit({ llmContent: true, sentences: true })).max(400), plan: questionPlanSchema.nullable() }),
]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** リンク自身の情報と記録だけを返す。鍵はURLに含めず、ヘッダーで受ける。 */
export async function GET(request: Request) {
  try {
    const { repo, target } = await requirePractice(request);
    const id = request.headers.get("x-practice-session");
    if (id) {
      if (!z.uuid().safeParse(id).success) return jsonError(400,"INVALID_REQUEST","入力内容が正しくありません");
      const session = await repo.get(target.id,id);
      return session ? json({ session }) : jsonError(404,"NOT_FOUND","この練習は見つかりません");
    }
    return json({ target, sessions: await repo.list(target.id) });
  } catch (e) { return practiceFailure(e); }
}
export async function POST(request: Request) {
  try {
    const { repo, target, hash } = await requirePractice(request);
    const parsed = bodySchema.safeParse(await readJson(request, 1_000_000));
    if (!parsed.success) return jsonError(400,"INVALID_REQUEST","入力内容が正しくありません");
    const body = parsed.data;
    if (body.action === "start") {
      const voices = await interviewerVoices();
      return json({ session: await repo.start(hash,body.requestId,body.answerBy,voices.google ?? "") });
    }
    const session = await repo.get(target.id,body.sessionId);
    if (!session) return jsonError(404,"NOT_FOUND","この練習は見つかりません");
    if (body.action === "retry") {
      // 結果をまとめられなかった・止まった練習だけ。権利は1回だけ取れるので、続けて押しても処理は1回(段階D)
      if (!await repo.reopen(target.id, session.id)) return jsonError(409,"NOT_RETRYABLE","いまは作り直せません。少し待ってから開き直してください");
      after(() => evaluatePractice(repo, target.id, session, session.history, session.plan));
      return json({ session: await repo.get(target.id,session.id) }, 202);
    }
    const claimed = await repo.finish(target.id,session.id,body.history,body.plan);
    // 保存してから応答。画面を閉じても、評価はリクエストの上限時間まで続ける。
    if (claimed) after(() => evaluatePractice(repo, target.id, session, body.history, body.plan));
    return json({ session: await repo.get(target.id,session.id) }, claimed ? 202 : 200);
  } catch (e) {
    if (e instanceof SyntaxError || e instanceof RangeError) return jsonError(400,"INVALID_REQUEST","入力内容が正しくありません");
    return practiceFailure(e);
  }
}
