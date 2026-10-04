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
