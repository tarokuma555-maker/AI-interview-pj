import { z } from "zod";

export const QUESTION_CATEGORIES = [
  "career_summary",
  "reason_for_change",
  "motivation",
  "achievements",
  "strengths_weaknesses",
  "challenges",
  "management_team",
  "expertise",
  "career_plan",
  "conditions",
  "other_applications",
] as const;

export const QUESTION_CATEGORY_LABELS: Record<(typeof QUESTION_CATEGORIES)[number], string> = {
  career_summary: "自己紹介・職務経歴",
  reason_for_change: "転職理由",
  motivation: "志望動機",
  achievements: "実績・成果",
  strengths_weaknesses: "強み・弱み",
  challenges: "困難・失敗経験",
  management_team: "マネジメント・チーム",
  expertise: "専門スキル・業務知識",
  career_plan: "キャリアプラン",
  conditions: "希望条件",
  other_applications: "選考状況",
};

/** 質問計画(設計書 4.5)。数値の範囲などはスキーマで表せないため、受信後に normalizePlan で整える */
export const questionPlanSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      category: z.enum(QUESTION_CATEGORIES),
      text: z.string(),
      intent: z.string(),
      followup_hints: z.array(z.string()),
      priority: z.number().int(),
    }),
  ),
  stt_keywords: z.array(z.string()),
});

export type QuestionPlan = z.infer<typeof questionPlanSchema>;

export function normalizePlan(plan: QuestionPlan): QuestionPlan {
  return {
    questions: plan.questions.slice(0, 24).map((q, i) => ({
      ...q,
      id: q.id || `q${i + 1}`,
      priority: Math.min(3, Math.max(1, q.priority)),
      followup_hints: q.followup_hints.slice(0, 4),
    })),
    stt_keywords: Array.from(new Set(plan.stt_keywords.map((k) => k.trim()).filter(Boolean))).slice(0, 50),
  };
}
