import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getAnthropic } from "@/lib/ai/client";
import { FALLBACK_BETA, FEEDBACK_MODEL } from "@/lib/ai/models";
import { FEEDBACK_SYSTEM_PROMPT } from "@/lib/ai/prompts/feedback";
import { feedbackOutputSchema, normalizeFeedback, type Feedback } from "@/lib/ai/schemas/feedback";
import { QUESTION_CATEGORY_LABELS, type QuestionPlan } from "@/lib/ai/schemas/plan";
import { STAGE_LABELS, STYLE_LABELS, type CandidateContext, type SessionSettings, type TurnRecord } from "@/lib/interview/types";
import { answerMetrics, type AnswerMetrics } from "@/lib/interview/speech-metrics";

/**
 * 面接後の評価・フィードバックの生成(設計書 4.6)。
 * 話し方の計測値はAIではなく計算で出し(speech-metrics.ts)、AIには「話し方・伝え方」の材料として渡す。
 */

export type FeedbackInput = {
  settings: SessionSettings;
  context: CandidateContext;
  plan: QuestionPlan | null;
  history: TurnRecord[];
};

export class NoAnswerError extends Error {
  constructor() {
    super("回答がないため、評価できません");
  }
}

/** 1回目は時間をかけて考えさせ、形式の誤りなどで失敗したら、残り時間があれば軽めの設定で1回だけ作り直す */
const ATTEMPTS = [
  { effort: FEEDBACK_MODEL.effort, timeout: 140_000, maxRetries: 1 },
  { effort: "medium" as const, timeout: 100_000, maxRetries: 0 },
];
const RETRY_IF_ELAPSED_UNDER_MS = 150_000;

export async function generateFeedback(input: FeedbackInput): Promise<{ feedback: Feedback; metrics: AnswerMetrics[] }> {
  const metrics = answerMetrics(input.history);
  if (metrics.length === 0) throw new NoAnswerError();
  const request = renderFeedbackRequest(input, metrics);
  const started = Date.now();
  let lastError: unknown = null;
  for (const [i, attempt] of ATTEMPTS.entries()) {
    if (i > 0 && Date.now() - started > RETRY_IF_ELAPSED_UNDER_MS) break;
    try {
      const response = await getAnthropic().beta.messages.parse(
        {
          model: FEEDBACK_MODEL.id,
          max_tokens: 20000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          output_config: { effort: attempt.effort, format: betaZodOutputFormat(feedbackOutputSchema) },
          system: FEEDBACK_SYSTEM_PROMPT,
          messages: [{ role: "user", content: request }],
        },
        { timeout: attempt.timeout, maxRetries: attempt.maxRetries },
      );
      if (response.stop_reason === "refusal") throw new Error("評価の生成が拒否されました");
      if (response.stop_reason === "max_tokens" || !response.parsed_output) {
        lastError = new Error(`評価の形式が正しくありません(${response.stop_reason})`);
        continue;
      }
      return { feedback: normalizeFeedback(response.parsed_output, metrics.map((m) => m.turn_seq)), metrics };
    } catch (error) {
      // API のエラー(認証・上限など)は作り直しても直らないため、そのまま返す。出力の読み取りの失敗だけ作り直す
      if (error instanceof Anthropic.APIError || (error instanceof Error && error.message.includes("拒否"))) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("評価を生成できませんでした");
}

export function renderFeedbackRequest(input: FeedbackInput, metrics: AnswerMetrics[]): string {
  const { settings, context, plan, history } = input;
  const turns = history.filter((turn) => turn.speaker !== "system");
  const metricsBySeq = new Map(metrics.map((m) => [m.turn_seq, m]));
  const transcript = turns.map((turn, i) => {
    const seq = i + 1;
    if (turn.speaker === "interviewer") {
      const label = turn.text.includes("[[REVERSE]]") ? "面接官(逆質問を促す)" : "面接官";
      return `[${seq}] ${label}: ${turn.text.replace(/\[\[[A-Z]+\]\]/g, "").trim()}`;
    }
    return `[${seq}] ${metricsBySeq.get(seq)?.isReverseQuestion ? "求職者(逆質問)" : "求職者"}: ${turn.text}`;
  });
  const delivery = metrics.map((m) => {
    if (m.inputMode === "text") return `[${m.turn_seq}] 文字で入力(計測値なし)`;
    const parts = [
      m.speechSec !== undefined ? `回答の長さ ${m.speechSec}秒` : null,
      m.charsPerMinute !== undefined ? `1分あたり ${m.charsPerMinute}字` : null,
      m.responseDelaySec !== undefined ? `話し始めるまで ${m.responseDelaySec}秒` : null,
      m.isIntroduction ? "自己紹介" : null,
    ].filter(Boolean);
    return `[${m.turn_seq}] ${parts.join("、") || "計測値なし"}`;
  });
  return [
    "<面接設定>",
    `選考段階: ${STAGE_LABELS[settings.stage]}`,
    `面接官スタイル: ${STYLE_LABELS[settings.style]}`,
    `面接時間: 約${settings.durationMin}分`,
    "</面接設定>",
    "",
    "<応募先>",
    `企業名: ${context.companyName || "(登録なし)"}`,
    `ポジション: ${context.position || "(登録なし)"}`,
    context.jobDescription || "(登録なし)",
    "</応募先>",
    "",
    "<応募書類>",
    "【職務経歴の要約】",
    context.careerSummary || "(登録なし)",
    "【転職理由のメモ】",
    context.reasonForChange || "(登録なし)",
    "</応募書類>",
    "",
    "<質問計画>",
    ...(plan?.questions ?? []).map((q) => `- (${QUESTION_CATEGORY_LABELS[q.category]}) ${q.text} [ねらい: ${q.intent}]`),
    "</質問計画>",
    "",
    "<面接の記録>",
    ...transcript,
    "</面接の記録>",
    "",
    "<話し方の計測値>",
    ...delivery,
    "</話し方の計測値>",
    "",
    `評価する回答の番号: ${[...metricsBySeq.keys()].join(", ")}`,
  ].join("\n");
}
