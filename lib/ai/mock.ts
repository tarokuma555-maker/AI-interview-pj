import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { FeedbackInput } from "@/lib/ai/feedback";
import type { InterviewerModel, InterviewerRequest, InterviewerResult } from "@/lib/ai/interviewer";
import { FEEDBACK_AXES, normalizeFeedback, type Feedback } from "@/lib/ai/schemas/feedback";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { CandidateContext } from "@/lib/interview/types";
import { answerMetrics, type AnswerMetrics } from "@/lib/interview/speech-metrics";

/**
 * APIキーなしで画面と音声の流れを確認するための模擬AI(AI_PROVIDER=mock)。
 * 応答は固定の文面で、ストリーミングを模して少しずつ返す。
 */

export function mockQuestionPlan(context: CandidateContext): QuestionPlan {
  const company = context.companyName || "当社";
  return {
    questions: [
      { id: "q1", category: "reason_for_change", text: "今回、転職を考えられたきっかけを教えてください。", intent: "前向きな理由か", followup_hints: ["現職で実現できない理由"], priority: 1 },
      { id: "q2", category: "motivation", text: `数ある企業の中で、なぜ${company}を志望されたのですか。`, intent: "企業理解と志望度", followup_hints: ["他社との違い"], priority: 1 },
      { id: "q3", category: "achievements", text: "これまでで最も成果を上げたお仕事について教えてください。", intent: "実績の具体性", followup_hints: ["数字", "自分の役割"], priority: 1 },
      { id: "q4", category: "career_plan", text: "入社後、どのようなキャリアを描いていますか。", intent: "長期的な貢献", followup_hints: [], priority: 2 },
    ],
    stt_keywords: [context.companyName, context.position].filter(Boolean),
  };
}

export class MockInterviewer implements InterviewerModel {
  async stream(request: InterviewerRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<InterviewerResult> {
    const text = mockReply(request.messages, request.sessionContext);
    for (let i = 0; i < text.length; i += 6) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      onText(text.slice(i, i + 6));
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return { content: [{ type: "text", text }], stopReason: "end_turn", usage: null };
  }

  async prewarm(): Promise<void> {}
}

function mockReply(messages: BetaMessageParam[], sessionContext: string): string {
  const answers = messages.filter((m) => m.role === "user").length - 1;
  const lastSystem = [...messages].reverse().find((m) => m.role === "system");
  if (typeof lastSystem?.content === "string" && lastSystem.content.includes("[[END]]")) {
    return "承知いたしました。本日の面接は以上です。お疲れさまでした。[[END]]";
  }
  // 面接官の名前が指定されていれば、名字で名乗る
  const name = /面接官の名前: (?!\(指定なし\))(\S+)/.exec(sessionContext)?.[1];
  const script = [
    `本日はお時間をいただきありがとうございます。面接を担当いたします${name ? `${name}` : "人事の者"}です。まずは自己紹介と、これまでのご経歴を簡単にお聞かせください。`,
    "ありがとうございます。今回、転職を考えられたきっかけを教えてください。",
    "なるほど。その中で、ご自身が特に工夫されたことは何でしょうか。",
    "よく分かりました。それでは最後に、何かご質問はありますか。[[REVERSE]]",
    "ご質問ありがとうございます。詳しくは確認して後ほどお伝えします。本日の面接は以上です。お疲れさまでした。[[END]]",
  ];
  return script[Math.min(answers, script.length - 1)];
}

/** 模擬AIの評価。回答の長さだけから決まる固定の文面で、画面の確認に使う */
export function mockFeedback(input: FeedbackInput): { feedback: Feedback; metrics: AnswerMetrics[] } {
  const metrics = answerMetrics(input.history);
  const detailed = metrics.filter((m) => m.answer.length >= 60).length;
  const base = Math.min(5, 2 + Math.round((detailed / Math.max(1, metrics.length)) * 2));
  const output = {
    summary:
      "(模擬AIによる固定の講評です)質問の意図をくみ取り、落ち着いて答えられていました。一方で、経験の説明が状況の説明にとどまる回答があり、ご自身が何を判断し、どう行動し、どんな結果になったのかが伝わりにくい場面がありました。次回は、結論を先に述べたうえで、具体的な場面と数字を1つずつ添えることを意識すると、経験の厚みがより伝わります。",
    axes: FEEDBACK_AXES.map((key, i) => ({ key, score: Math.max(1, base - (i % 2)), reason: "模擬AIのため、回答の長さから仮に付けた評価です。", evidence_turn_seqs: metrics.slice(0, 1).map((m) => m.turn_seq) })),
    strengths: ["問いに対して、まず結論から答えようとしていました", "丁寧な言葉づかいで、落ち着いて話せていました"],
    improvements: ["ご自身の役割と行動を、具体的な場面とあわせて話しましょう", "成果は数字や前後の変化で示すと伝わりやすくなります"],
    answers: metrics.map((m) => ({
      turn_seq: m.turn_seq,
      rating: m.answer.length >= 60 ? 4 : 3,
      good_points: ["質問に沿って答えられていました"],
      improvements: m.answer.length >= 60 ? ["結論を最初の一文にまとめると、さらに伝わりやすくなります"] : ["具体的な場面や数字を加えて、もう少し詳しく話しましょう"],
      improved_answer: `${m.answer}(例)具体的には、どのような場面で、どう判断し、どのような結果につながったのかを一言添えます。`,
      uses_assumed_content: true,
    })),
    next_actions: [
      { title: "結論から話す", detail: "どの質問にも、最初の一文で結論を言い切る練習をしましょう。", category: "career_summary" as const },
      { title: "経験を数字で語る", detail: "代表的な経験を2つ選び、人数・件数・割合などの数字を添えて話せるよう準備しましょう。", category: "achievements" as const },
      { title: "志望理由を応募先に結びつける", detail: "求人の仕事内容から2つ選び、ご自身の経験がどう活きるかを話せるよう準備しましょう。", category: "motivation" as const },
    ],
  };
  return { feedback: normalizeFeedback(output, metrics.map((m) => m.turn_seq)), metrics };
}
