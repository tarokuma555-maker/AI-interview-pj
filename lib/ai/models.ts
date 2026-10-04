import type { BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { InterviewerModelKey } from "@/lib/interview/types";

/** 安全上の理由で応答が拒否された場合に、別のモデルで応答させる(設計書 4.8) */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type InterviewerModelConfig = {
  id: string;
  label: string;
  thinking?: BetaThinkingConfigParam;
  effort: "low" | "medium" | "high";
  /** 思考を無効にできないモデルで、最初の文字が出るまでの時間を短くするための指示を加えるか */
  directAnswerHint: boolean;
};

/** 面接官のモデル(設計書 4.1)。どちらを使うかは開発ステップ2で実測して決める */
export const INTERVIEWER_MODELS: Record<InterviewerModelKey, InterviewerModelConfig> = {
  sonnet: {
    id: process.env.AI_MODEL_INTERVIEWER_SONNET ?? "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5(速さ重視)",
    // Sonnet 5.5 で思考を行わない設定。effort は high 以下でのみ使える
    thinking: { type: "between_tools" },
    effort: "low",
    directAnswerHint: false,
  },
  opus: {
    id: process.env.AI_MODEL_INTERVIEWER_OPUS ?? "claude-opus-5-5",
    label: "Claude Opus 5.5(質重視)",
    // Opus 5.5 は思考を無効にできないため省略(adaptive)し、effort を下げる
    effort: "low",
    directAnswerHint: true,
  },
};

export const PLAN_MODEL = {
  id: process.env.AI_MODEL_PLAN ?? "claude-opus-5-5",
  effort: "medium" as const,
};

export function isMockAi(): boolean {
  return process.env.AI_PROVIDER === "mock";
}
