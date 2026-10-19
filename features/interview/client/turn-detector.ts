/**
 * 話し終わりの判定(設計書 3.4)。入力だけで結果が決まる純粋な処理にして、単体テストで調整する。
 */

export type TurnDetectorParams = {
  /** これより短い発話は雑音とみなす */
  minSpeechMs: number;
  /** 「以上です」などの締めの言葉で終わってから、話し終わりとするまでの間(言い足すときのための余裕) */
  closingWaitMs: number;
  /** 締めの言葉がなくても、この時間黙ったら話し終わり */
  silenceEndMs: number;
  /** 1回の発話の上限 */
  maxUtteranceMs: number;
};

/**
 * 話の途中の間では回答を終えず、「以上です」などの締めの言葉か、10秒以上の沈黙で終える(依頼者の決定。要件 F-05-4)。
 * 自己紹介(2〜3分)を区切らないよう、1回の発話の上限は5分にする。
 */
export const DEFAULT_TURN_PARAMS: TurnDetectorParams = {
  minSpeechMs: 300,
  closingWaitMs: 1000,
  silenceEndMs: 10_000,
  maxUtteranceMs: 300_000,
};

/** 締めの言葉(句読点・空白を除いた文末)。「以上です。よろしくお願いいたします」のように続けた形も含める */
const CLOSING = /以上(です|でございます|になります|となります)(よろしくお願い(いた)?します|よろしくお願い申し上げます)?$/;
/**
 * 「8年以上です」「3割以上です」のように、数や単位に続く「以上です」は締めの言葉ではない。
 * 「以上」の直前がこれらの文字なら、話の途中とみなす
 */
const QUANTITY_BEFORE = /[0-9０-９一二三四五六七八九十百千万億年割件人名歳%％倍回日月週点円床社台分秒個本枚度期代間位級段]$/;

/** 回答が締めの言葉で終わっているか */
export function endsWithClosing(text: string): boolean {
  const core = text.replace(/[\s、。,.!?！？…・「」]/g, "");
  const match = CLOSING.exec(core);
  if (!match) return false;
  return !QUANTITY_BEFORE.test(core.slice(0, match.index));
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
  if (endsWithClosing(s.text) && silence >= p.closingWaitMs) return { end: true, reason: "closing" };
  if (silence >= p.silenceEndMs) return { end: true, reason: "silence" };
  return { end: false };
}
