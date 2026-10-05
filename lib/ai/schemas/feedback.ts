import { z } from "zod";
import { QUESTION_CATEGORIES } from "./plan";

/** 評価の観点(要件 7.3、設計書 4.6) */
export const FEEDBACK_AXES = ["logic", "specificity", "transferability", "consistency", "motivation", "delivery"] as const;
export type FeedbackAxis = (typeof FEEDBACK_AXES)[number];

export const FEEDBACK_AXIS_LABELS: Record<FeedbackAxis, string> = {
  logic: "論理性・的確さ",
  specificity: "実績の具体性",
  transferability: "再現性・即戦力性",
  consistency: "転職の一貫性・納得感",
  motivation: "志望度・企業理解",
  delivery: "話し方・伝え方",
};

/**
 * AIが出力する評価(構造化出力)。数値の範囲や件数はスキーマで表せないため、受信後に normalizeFeedback で整える。
 * 総合スコアはAIに出させず、観点別評価から計算する(同じ評価からは必ず同じ点数になるように)。
 */
export const feedbackOutputSchema = z.object({
  summary: z.string(),
  axes: z.array(
    z.object({
      key: z.enum(FEEDBACK_AXES),
      score: z.number().int(),
      reason: z.string(),
      evidence_turn_seqs: z.array(z.number().int()),
    }),
  ),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  answers: z.array(
    z.object({
      turn_seq: z.number().int(),
      rating: z.number().int(),
      good_points: z.array(z.string()),
      improvements: z.array(z.string()),
      improved_answer: z.string(),
      uses_assumed_content: z.boolean(),
    }),
  ),
  next_actions: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      category: z.enum(QUESTION_CATEGORIES),
    }),
  ),
});
export type FeedbackOutput = z.infer<typeof feedbackOutputSchema>;

/** 画面に出す評価(総合スコアを加え、範囲・件数を整えたもの) */
export type Feedback = FeedbackOutput & { overall_score: number };

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)));

/**
 * 範囲・件数を整える。観点は6つすべてを決まった順にそろえ(欠けた観点は中間の3とする)、
 * 質問ごとの講評は実在する回答の番号だけを残す。総合スコアは観点別評価の平均 × 20(20〜100点)。
 */
export function normalizeFeedback(output: FeedbackOutput, answerSeqs: number[]): Feedback {
  const valid = new Set(answerSeqs);
  const axes = FEEDBACK_AXES.map((key) => {
    const found = output.axes.find((axis) => axis.key === key);
    return {
      key,
      score: clampInt(found?.score ?? 3, 1, 5),
      reason: found?.reason ?? "",
      evidence_turn_seqs: (found?.evidence_turn_seqs ?? []).filter((seq) => valid.has(seq)),
    };
  });
  const seen = new Set<number>();
  const answers = output.answers
    .filter((answer) => valid.has(answer.turn_seq) && !seen.has(answer.turn_seq) && seen.add(answer.turn_seq))
    .sort((a, b) => a.turn_seq - b.turn_seq)
    .map((answer) => ({
      ...answer,
      rating: clampInt(answer.rating, 1, 5),
      good_points: answer.good_points.slice(0, 3),
      improvements: answer.improvements.slice(0, 3),
    }));
  const average = axes.reduce((sum, axis) => sum + axis.score, 0) / axes.length;
  return {
    overall_score: Math.round(average * 20),
    summary: output.summary.trim(),
    axes,
    strengths: output.strengths.slice(0, 3),
    improvements: output.improvements.slice(0, 3),
    answers,
    next_actions: output.next_actions.slice(0, 3),
  };
}
