import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { InterviewerModel, InterviewerRequest, InterviewerResult } from "@/lib/ai/interviewer";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { CandidateContext } from "@/lib/interview/types";

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
