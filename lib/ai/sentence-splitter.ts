/**
 * AI の出力を、音声合成に渡す文の単位に区切る(設計書 3.5)。
 * ストリーミングで少しずつ届く文字列に対応し、制御タグ([[REVERSE]] / [[END]])は取り除いて通知する。
 */

export type ControlTag = "REVERSE" | "END";

const TERMINATORS = new Set(["。", "！", "？", "!", "?", "\n"]);
const CLOSERS = new Set(["」", "』", "）", ")", "】", "\"", "”", "’"]);
const LONG_SENTENCE_CHARS = 80;
const TAG_PATTERN = /\[\[([A-Z_]+)\]\]/g;

export type SplitResult = { sentences: string[]; tags: ControlTag[] };

export class SentenceSplitter {
  private buffer = "";

  push(delta: string): SplitResult {
    this.buffer += delta;
    return this.drain(false);
  }

  flush(): SplitResult {
    return this.drain(true);
  }

  private drain(final: boolean): SplitResult {
    const tags: ControlTag[] = [];
    this.buffer = this.buffer.replace(TAG_PATTERN, (_m, name: string) => {
      if (name === "REVERSE" || name === "END") tags.push(name);
      return "";
    });

    // 閉じていない制御タグ(または "[" 1文字)は、続きが届くまで保留する
    let holdFrom = this.buffer.length;
    const openTag = this.buffer.indexOf("[[");
    if (openTag !== -1) holdFrom = openTag;
    else if (this.buffer.endsWith("[")) holdFrom = this.buffer.length - 1;

    const sentences: string[] = [];
    let region = this.buffer.slice(0, holdFrom);
    let held = this.buffer.slice(holdFrom);
    if (final) {
      // 最後まで閉じなかった "[[" はタグではないので、本文として扱う
      region += held.replace(/\[/g, "");
      held = "";
    }

    for (;;) {
      const end = findSentenceEnd(region, final);
      if (end === -1) break;
      pushSentence(sentences, region.slice(0, end));
      region = region.slice(end);
    }

    while (region.length > LONG_SENTENCE_CHARS) {
      const comma = region.lastIndexOf("、", LONG_SENTENCE_CHARS);
      if (comma <= 0) break;
      pushSentence(sentences, region.slice(0, comma + 1));
      region = region.slice(comma + 1);
    }

    if (final) {
      pushSentence(sentences, region);
      this.buffer = "";
    } else {
      this.buffer = region + held;
    }
    return { sentences, tags };
  }
}

/** 文末(句読点+直後の閉じ括弧)の直後の位置。文末がなければ -1 */
function findSentenceEnd(text: string, final: boolean): number {
  for (let i = 0; i < text.length; i++) {
    if (!TERMINATORS.has(text[i])) continue;
    let end = i + 1;
    while (end < text.length && (TERMINATORS.has(text[end]) || CLOSERS.has(text[end]))) end++;
    // 句読点がまだ末尾にある間は、閉じ括弧が続くかもしれないので次の文字を待つ
    if (end === text.length && !final && text[i] !== "\n") return -1;
    return end;
  }
  return -1;
}

function pushSentence(out: string[], raw: string) {
  const text = raw.replace(/\s+/g, " ").trim();
  if (text) out.push(text);
}

/** 表示・評価用に制御タグを取り除く */
export function stripControlTags(text: string): string {
  return text.replace(TAG_PATTERN, "").trim();
}
