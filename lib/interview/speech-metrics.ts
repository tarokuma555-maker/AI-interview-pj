/**
 * 話し方の計測値(設計書 4.6)。AIではなく計算で出す。
 */

/** 句読点・空白を除いた文字数 */
export function countSpokenChars(text: string): number {
  return text.replace(/[\s、。,.!?！？「」『』()（）・…〜~-]/g, "").length;
}

/** 1分あたりの文字数。発話時間が短すぎる場合は計算しない */
export function charsPerMinute(text: string, speechMs: number | undefined): number | undefined {
  if (!speechMs || speechMs < 3000) return undefined;
  return Math.round((countSpokenChars(text) / (speechMs / 60_000)) * 10) / 10;
}

/** 回答ごとの話し方の計測値(要件 F-07-5)。turn_seq は会話の記録(システムの通知を除く)の通し番号 */
export type AnswerMetrics = {
  turn_seq: number;
  /** 直前の面接官の発言 */
  question: string;
  answer: string;
  inputMode?: "voice" | "text";
  /** 回答の長さ(秒)・話す速さ(1分あたりの文字数)・話し始めるまで(秒)。声で答えた場合だけ */
  speechSec?: number;
  charsPerMinute?: number;
  responseDelaySec?: number;
  /** 1つ目の回答(自己紹介・職務経歴の説明。目安の長さが長い) */
  isIntroduction: boolean;
  /** 逆質問の場面での発言(求職者から面接官への質問) */
  isReverseQuestion: boolean;
};

type TurnLike = {
  speaker: "interviewer" | "candidate" | "system";
  text: string;
  inputMode?: "voice" | "text";
  speechMs?: number;
  responseDelayMs?: number;
  phase?: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

export function answerMetrics(history: TurnLike[]): AnswerMetrics[] {
  const turns = history.filter((turn) => turn.speaker !== "system");
  const result: AnswerMetrics[] = [];
  let question = "";
  // 逆質問の場面(面接官が [[REVERSE]] を付けて逆質問を促した後)での発言は、逆質問とみなす。
  // 記録に残る面接官の発言からは印が取り除かれるため、求職者の発言に記録した段階で見分ける
  let reverse = false;
  turns.forEach((turn, i) => {
    if (turn.speaker === "interviewer") {
      if (turn.text.includes("[[REVERSE]]")) reverse = true;
      question = turn.text.replace(/\[\[[A-Z]+\]\]/g, "").trim();
      return;
    }
    const voice = turn.inputMode !== "text";
    result.push({
      turn_seq: i + 1,
      question,
      answer: turn.text,
      inputMode: turn.inputMode,
      speechSec: voice && turn.speechMs ? round1(turn.speechMs / 1000) : undefined,
      charsPerMinute: voice ? charsPerMinute(turn.text, turn.speechMs) : undefined,
      responseDelaySec: voice && turn.responseDelayMs !== undefined ? round1(turn.responseDelayMs / 1000) : undefined,
      isIntroduction: result.length === 0,
      isReverseQuestion: reverse || turn.phase === "reverse_questions",
    });
  });
  return result;
}

/** 話し方の目安(要件 7.3)。自己紹介は面接官が「2〜3分で」と求めるため長めにする */
export const DELIVERY_TARGETS = {
  answerSec: { min: 60, max: 120 },
  introductionSec: { min: 120, max: 180 },
  charsPerMinute: { min: 250, max: 350 },
  responseDelaySec: { max: 5 },
};

export type Judgement = "short" | "ok" | "long";

/** 回答の長さ:目安の下限の半分未満なら短め、上限の1.1倍を超えたら長め */
export function judgeLength(metrics: AnswerMetrics): Judgement | undefined {
  if (metrics.speechSec === undefined) return undefined;
  const target = metrics.isIntroduction ? DELIVERY_TARGETS.introductionSec : DELIVERY_TARGETS.answerSec;
  if (metrics.speechSec < target.min * 0.5) return "short";
  if (metrics.speechSec > target.max * 1.1) return "long";
  return "ok";
}

/** 話す速さ:short はゆっくり、long は速め */
export function judgeRate(metrics: AnswerMetrics): Judgement | undefined {
  if (metrics.charsPerMinute === undefined) return undefined;
  if (metrics.charsPerMinute < DELIVERY_TARGETS.charsPerMinute.min) return "short";
  if (metrics.charsPerMinute > DELIVERY_TARGETS.charsPerMinute.max) return "long";
  return "ok";
}

export function judgeDelay(metrics: AnswerMetrics): Judgement | undefined {
  if (metrics.responseDelaySec === undefined) return undefined;
  return metrics.responseDelaySec > DELIVERY_TARGETS.responseDelaySec.max ? "long" : "ok";
}
