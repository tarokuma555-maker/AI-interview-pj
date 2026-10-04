import type {
  BetaContentBlockParam,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { OPENING_USER_MESSAGE } from "@/lib/ai/prompts/interviewer";
import type { TurnRecord } from "@/lib/interview/types";

/**
 * 会話履歴から Claude に送る messages を組み立てる(設計書 4.4)。
 * 同じ履歴からは常に同じ配列を返す(プロンプトキャッシュのため)。
 * 面接官の発言は、受け取った content ブロックを変更せずにそのまま返す。
 */
export function buildMessages(turns: TurnRecord[]): BetaMessageParam[] {
  const messages: BetaMessageParam[] = [{ role: "user", content: OPENING_USER_MESSAGE }];

  turns.forEach((turn, i) => {
    switch (turn.speaker) {
      case "interviewer": {
        const content = interviewerContent(turn);
        if (content) messages.push({ role: "assistant", content });
        break;
      }
      case "candidate":
        messages.push({ role: "user", content: turn.text });
        break;
      case "system": {
        // システムメッセージの後には面接官の発言が続く必要がある。面接官の応答が得られなかった
        // (生成前に割り込まれた・失敗した)ときの通知は、送らずに読み飛ばす
        const isLast = i === turns.length - 1;
        const next = turns[i + 1];
        const followedByReply = next?.speaker === "interviewer" && interviewerContent(next) !== null;
        if (isLast || followedByReply) messages.push({ role: "system", content: turn.text });
        break;
      }
    }
  });
  return messages;
}

function interviewerContent(turn: TurnRecord): BetaContentBlockParam[] | null {
  if (turn.llmContent && turn.llmContent.length > 0) {
    return turn.llmContent as unknown as BetaContentBlockParam[];
  }
  return turn.text ? [{ type: "text", text: turn.text }] : null;
}

/**
 * システムメッセージは「ユーザーの発言の直後」にしか置けない。
 * ターンエンジンがこの規則を守っているかの確認に使う。
 */
export function hasValidSystemPlacement(messages: BetaMessageParam[]): boolean {
  return messages.every((m, i) => {
    if (m.role !== "system") return true;
    const prev = messages[i - 1];
    const next = messages[i + 1];
    return prev !== undefined && (prev.role === "user" || prev.role === "system") && (next === undefined || next.role === "assistant");
  });
}
