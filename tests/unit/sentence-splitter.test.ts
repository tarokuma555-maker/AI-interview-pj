import { describe, expect, it } from "vitest";
import { SentenceSplitter, stripControlTags } from "@/lib/ai/sentence-splitter";

function feed(chunks: string[]) {
  const splitter = new SentenceSplitter();
  const sentences: string[] = [];
  const tags: string[] = [];
  for (const chunk of chunks) {
    const r = splitter.push(chunk);
    sentences.push(...r.sentences);
    tags.push(...r.tags);
  }
  const r = splitter.flush();
  sentences.push(...r.sentences);
  tags.push(...r.tags);
  return { sentences, tags };
}

describe("SentenceSplitter", () => {
  it("句点で文を区切る", () => {
    expect(feed(["ありがとうございます。では、", "転職理由を教えてください。"]).sentences).toEqual([
      "ありがとうございます。",
      "では、転職理由を教えてください。",
    ]);
  });

  it("文が届いた時点で返す(ストリーミング)", () => {
    const splitter = new SentenceSplitter();
    expect(splitter.push("はい。").sentences).toEqual([]); // 閉じ括弧が続くかもしれないので待つ
    expect(splitter.push("次に").sentences).toEqual(["はい。"]);
  });

  it("句点の後の閉じ括弧を同じ文に含める", () => {
    expect(feed(["「よろしくお願いします。", "」と伝えました。"]).sentences).toEqual([
      "「よろしくお願いします。」",
      "と伝えました。",
    ]);
  });

  it("全角・半角の疑問符や感嘆符でも区切る", () => {
    expect(feed(["本当ですか？はい!そうです?"]).sentences).toEqual(["本当ですか？", "はい!", "そうです?"]);
  });

  it("80文字を超える文は読点で分ける", () => {
    const long = `${"あ".repeat(50)}、${"い".repeat(50)}`;
    const { sentences } = feed([long]);
    expect(sentences).toEqual([`${"あ".repeat(50)}、`, "い".repeat(50)]);
  });

  it("制御タグを取り除いて通知する", () => {
    const { sentences, tags } = feed(["最後に何かご質問はありますか。[[RE", "VERSE]]"]);
    expect(sentences).toEqual(["最後に何かご質問はありますか。"]);
    expect(tags).toEqual(["REVERSE"]);
  });

  it("文の途中で分割された終了タグも検出する", () => {
    const { sentences, tags } = feed(["本日は以上です。", "[", "[END", "]]"]);
    expect(sentences).toEqual(["本日は以上です。"]);
    expect(tags).toEqual(["END"]);
  });

  it("閉じなかった [[ は本文として扱う", () => {
    expect(feed(["配列は[[1, 2]と書きます"]).sentences).toEqual(["配列は1, 2]と書きます"]);
  });

  it("空白だけの文は返さない", () => {
    expect(feed(["  \n", "はい。\n\n"]).sentences).toEqual(["はい。"]);
  });

  it("stripControlTags はタグだけを取り除く", () => {
    expect(stripControlTags("ありがとうございました。[[END]]")).toBe("ありがとうございました。");
  });
});
