import { z } from "zod";
import { generateFeedback, NoAnswerError } from "@/lib/ai/feedback";
import { mockFeedback } from "@/lib/ai/mock";
import { isMockAi } from "@/lib/ai/models";
import { questionPlanSchema } from "@/lib/ai/schemas/plan";
import { candidateContextSchema, sessionSettingsSchema, turnRecordSchema } from "@/lib/interview/types";
import { checkPocAccess, jsonError, readJson } from "@/lib/poc/access";

/** 評価は質を重視して時間をかけるため、長めに待てるようにする(目標は60秒以内。要件 NF-P-05) */
export const maxDuration = 300;

const bodySchema = z.object({
  settings: sessionSettingsSchema,
  context: candidateContextSchema,
  plan: questionPlanSchema.nullable(),
  // AIの応答の中身(llmContent)は評価に使わないため、送らない
  history: z.array(turnRecordSchema.omit({ llmContent: true })).max(400),
});

/** 面接後の評価・フィードバックを生成する(設計書 4.6) */
export async function POST(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 1_000_000));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "入力内容が正しくありません");
  }

  try {
    const result = isMockAi() ? mockFeedback(body) : await generateFeedback(body);
    if (result.metrics.length === 0) throw new NoAnswerError();
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof NoAnswerError) return jsonError(422, "NO_ANSWERS", "回答がないため、評価はありません");
    console.error("feedback generation failed", error);
    return jsonError(502, "FEEDBACK_FAILED", "評価を作成できませんでした。「評価を作り直す」でもう一度お試しください", true);
  }
}
