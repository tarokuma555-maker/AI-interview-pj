import { QUESTION_CATEGORY_LABELS, type QuestionPlan } from "@/lib/ai/schemas/plan";
import {
  STAGE_LABELS,
  STYLE_LABELS,
  type CandidateContext,
  type SessionSettings,
} from "@/lib/interview/types";

/**
 * セッション固有の情報(面接設定・書類・求人・質問計画)を、プロンプトの system ブロック2に
 * 入れる文字列にする(設計書 4.2)。プロンプトキャッシュを効かせるため、
 * 同じ入力からは必ず同じ文字列を返す(時刻や乱数を入れない)。
 */
export function renderSessionContext(
  settings: SessionSettings,
  context: CandidateContext,
  plan: QuestionPlan,
): string {
  const lines = [
    "<面接設定>",
    `選考段階: ${STAGE_LABELS[settings.stage]}`,
    `面接官スタイル: ${STYLE_LABELS[settings.style]}`,
    `予定時間: ${settings.durationMin}分`,
    `面接官の名前: ${settings.interviewerName?.trim() || "(指定なし)"}`,
    "</面接設定>",
    "",
    "<求人情報>",
    `企業名: ${orNone(context.companyName)}`,
    `ポジション: ${orNone(context.position)}`,
    orNone(context.jobDescription),
    "</求人情報>",
    "",
    "<応募書類>",
    "【職務経歴の要約】",
    orNone(context.careerSummary),
    "【転職理由のメモ】",
    orNone(context.reasonForChange),
    "</応募書類>",
    "",
    "<質問計画>",
    ...plan.questions.map(
      (q) =>
        `- [優先度${q.priority}][${QUESTION_CATEGORY_LABELS[q.category]}] ${q.text}(意図: ${q.intent}${
          q.followup_hints.length ? ` / 深掘りの観点: ${q.followup_hints.join("、")}` : ""
        })`,
    ),
    "</質問計画>",
  ];
  return lines.join("\n");
}

function orNone(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed : "(登録なし)";
}
