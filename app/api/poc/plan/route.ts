import { after } from "next/server";
import { z } from "zod";
import { ClaudeInterviewer } from "@/lib/ai/interviewer";
import { buildMessages } from "@/lib/ai/messages";
import { mockQuestionPlan } from "@/lib/ai/mock";
import { isMockAi } from "@/lib/ai/models";
import { generateQuestionPlan } from "@/lib/ai/plan";
import { renderSessionContext } from "@/lib/ai/session-context";
import { candidateContextSchema, sessionSettingsSchema } from "@/lib/interview/types";
import { checkPocAccess, jsonError, readJson } from "@/lib/poc/access";

export const maxDuration = 120;

const bodySchema = z.object({ settings: sessionSettingsSchema, context: candidateContextSchema });

/** 質問計画を生成する(設計書 4.5)。生成後、面接官のプロンプトキャッシュを事前に作成する */
export async function POST(request: Request) {
  const denied = checkPocAccess(request);
  if (denied) return denied;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await readJson(request, 200_000));
  } catch {
    return jsonError(400, "INVALID_REQUEST", "入力内容が正しくありません");
  }

  if (isMockAi()) {
    return Response.json({ plan: mockQuestionPlan(body.context) });
  }

  try {
    const plan = await generateQuestionPlan(body.settings, body.context);
    after(async () => {
      try {
        await new ClaudeInterviewer().prewarm({
          modelKey: body.settings.interviewerModel,
          sessionContext: renderSessionContext(body.settings, body.context, plan),
          messages: buildMessages([]),
        });
      } catch (error) {
        console.warn("prompt cache prewarm failed", error);
      }
    });
    return Response.json({ plan });
  } catch (error) {
    console.error("plan generation failed", error);
    return jsonError(502, "PLAN_FAILED", "質問計画を生成できませんでした。もう一度お試しください", true);
  }
}
