import { describe, expect, it } from "vitest";
import { DEFAULT_TURN_PARAMS, decideTurnEnd, endsWithClosing, type TurnSignals } from "@/features/interview/client/turn-detector";

describe("endsWithClosing", () => {
  it.each([
    ["以上です", true],
    ["前職では法人営業を担当していました。以上です。", true],
    ["私からは以上です", true],
    ["簡単ではございますが、以上となります。", true],
    ["以上になります", true],
    ["以上でございます。", true],
    ["以上です。よろしくお願いいたします。", true],
    ["以上です よろしくお願いします", true],
    // 数や単位に続く「以上です」は話の途中
    ["看護師の経験は8年以上です。", false],
    ["売上は前年の3割以上です", false],
    ["月に10件以上です", false],
    ["1日8時間以上です", false],
    // 間があっても、締めの言葉がなければ続く
    ["前職では法人営業を担当していました。", false],
    ["以上の経験から", false],
    ["", false],
  ])("%s → %s", (text, expected) => {
    expect(endsWithClosing(text)).toBe(expected);
  });
});

const base: TurnSignals = {
  now: 10_000,
  speechStartedAt: 1_000,
  lastVoiceAt: 9_000,
  voiceActive: false,
  totalVoiceMs: 5_000,
  text: "法人営業を担当していました。",
  manualEnd: false,
};
const p = DEFAULT_TURN_PARAMS;

describe("decideTurnEnd", () => {
  it("ボタンが押されたら話し終わり", () => {
    expect(decideTurnEnd({ ...base, manualEnd: true, voiceActive: true }, p)).toEqual({ end: true, reason: "manual" });
  });

  it("話している間は判定しない", () => {
    expect(decideTurnEnd({ ...base, voiceActive: true, now: base.lastVoiceAt! + 20_000 }, p).end).toBe(false);
  });

  it("文字起こしが空なら判定しない", () => {
    expect(decideTurnEnd({ ...base, text: "", now: base.lastVoiceAt! + 20_000 }, p).end).toBe(false);
  });

  it("短すぎる発話は雑音とみなす", () => {
    expect(decideTurnEnd({ ...base, totalVoiceMs: 200, now: 20_000 }, p).end).toBe(false);
  });

  it("文が終わっていても、話の途中の間では終えない", () => {
    expect(decideTurnEnd({ ...base, now: base.lastVoiceAt! + 5_000 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...base, text: "前職では営業を担当していて、", now: base.lastVoiceAt! + 9_900 }, p).end).toBe(false);
  });

  it("「以上です」で終わったら、少し待って話し終わり(言い足す余裕を残す)", () => {
    const signals = { ...base, text: "法人営業を担当していました。以上です。" };
    expect(decideTurnEnd({ ...signals, now: base.lastVoiceAt! + 900 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...signals, now: base.lastVoiceAt! + 1_000 }, p)).toEqual({ end: true, reason: "closing" });
  });

  it("「以上です」がなくても、10秒黙ったら話し終わり", () => {
    expect(decideTurnEnd({ ...base, now: base.lastVoiceAt! + 9_999 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...base, now: base.lastVoiceAt! + 10_000 }, p)).toEqual({ end: true, reason: "silence" });
  });

  it("発話の上限(5分)に達したら、話している途中でも区切る", () => {
    expect(decideTurnEnd({ ...base, voiceActive: true, now: base.speechStartedAt! + 299_000 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...base, voiceActive: true, now: base.speechStartedAt! + 300_000 }, p)).toEqual({
      end: true,
      reason: "max_utterance",
    });
  });
});
