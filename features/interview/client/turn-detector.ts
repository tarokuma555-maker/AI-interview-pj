/**
 * 話し終わりの判定(設計書 3.4)。入力だけで結果が決まる純粋な処理にして、単体テストで調整する。
 */

export type TurnDetectorParams = {
  /** これより短い発話は雑音とみなす */
  minSpeechMs: number;
  /** 文末が完結した形のときの待ち時間 */
  completeWaitMs: number;
  /** 文末が完結とも続きそうとも言えないときの待ち時間 */
  neutralWaitMs: number;
  /** 文末の形にかかわらず、この時間黙ったら話し終わり */
  maxWaitMs: number;
  /** 1回の発話の上限 */
  maxUtteranceMs: number;
};

export const DEFAULT_TURN_PARAMS: TurnDetectorParams = {
  minSpeechMs: 300,
  completeWaitMs: 800,
  neutralWaitMs: 2500,
  maxWaitMs: 5000,
  maxUtteranceMs: 180_000,
};

/** 面接官スタイルが「やさしい」のときは待ち時間を長くする */
export function paramsForStyle(style: "gentle" | "standard" | "strict", base = DEFAULT_TURN_PARAMS): TurnDetectorParams {
  if (style !== "gentle") return base;
  return {
    ...base,
    completeWaitMs: base.completeWaitMs * 1.5,
    neutralWaitMs: base.neutralWaitMs * 1.5,
    maxWaitMs: base.maxWaitMs * 1.5,
  };
}

export type Ending = "complete" | "incomplete" | "neutral";

const COMPLETE_ENDING =
  /(です|ます|でした|ました|ません|ませんでした|でしょう|ですか|ますか|でしょうか|ませんか|と思います|と考えています|と考えております|以上です|以上となります|ございます|ございました)$/;
const INCOMPLETE_ENDING =
  /(が|けど|けれど|けれども|ので|から|て|で|し|たり|とか|えー|ええと|えーと|えっと|あの|あのー|その|まあ|ですが|ますが|ですけど)$/;

export function classifyEnding(text: string): Ending {
  const trimmed = text.trim();
  if (!trimmed) return "neutral";
  if (/[、,]$/.test(trimmed)) return "incomplete";
  const core = trimmed.replace(/[。.!?！？…\s]+$/, "");
  if (INCOMPLETE_ENDING.test(core)) return "incomplete";
  if (COMPLETE_ENDING.test(core)) return "complete";
  return "neutral";
}

export type TurnSignals = {
  now: number;
  /** 発話が始まった時刻(まだなら null) */
  speechStartedAt: number | null;
  /** 最後に声を検知した時刻 */
  lastVoiceAt: number | null;
  /** いま声を検知しているか */
  voiceActive: boolean;
  /** これまでに声を検知した合計時間 */
  totalVoiceMs: number;
  /** 文字起こし(確定+途中) */
  text: string;
  /** 「回答を終える」ボタンが押された */
  manualEnd: boolean;
};

export type TurnDecision = { end: true; reason: string } | { end: false };

export function decideTurnEnd(s: TurnSignals, p: TurnDetectorParams): TurnDecision {
  if (s.manualEnd) return { end: true, reason: "manual" };
  if (s.speechStartedAt === null || !s.text.trim()) return { end: false };
  if (s.now - s.speechStartedAt >= p.maxUtteranceMs) return { end: true, reason: "max_utterance" };
  if (s.voiceActive || s.lastVoiceAt === null) return { end: false };
  if (s.totalVoiceMs < p.minSpeechMs) return { end: false };

  const silence = s.now - s.lastVoiceAt;
  const ending = classifyEnding(s.text);
  if (ending === "complete" && silence >= p.completeWaitMs) return { end: true, reason: "complete" };
  if (ending === "neutral" && silence >= p.neutralWaitMs) return { end: true, reason: "neutral" };
  if (silence >= p.maxWaitMs) return { end: true, reason: "max_wait" };
  return { end: false };
}
