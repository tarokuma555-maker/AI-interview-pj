import { describe, expect, it } from "vitest";
import {
  DEFAULT_TURN_PARAMS,
  classifyEnding,
  decideTurnEnd,
  paramsForStyle,
  type TurnSignals,
} from "@/features/interview/client/turn-detector";

describe("classifyEnding", () => {
  it.each([
    ["前職では法人営業を担当していました。", "complete"],
    ["以上です", "complete"],
    ["御社の強みは何でしょうか?", "complete"],
    ["そう考えております。", "complete"],
    ["前職では営業を担当していて、", "incomplete"],
    ["売上を伸ばしたのですが", "incomplete"],
    ["えーと", "incomplete"],
    ["理由としては", "neutral"],
    ["", "neutral"],
  ])("%s → %s", (text, expected) => {
    expect(classifyEnding(text)).toBe(expected);
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
    expect(decideTurnEnd({ ...base, voiceActive: true }, p).end).toBe(false);
  });

  it("文字起こしが空なら判定しない", () => {
    expect(decideTurnEnd({ ...base, text: "" }, p).end).toBe(false);
  });

  it("短すぎる発話は雑音とみなす", () => {
    expect(decideTurnEnd({ ...base, totalVoiceMs: 200, now: 20_000 }, p).end).toBe(false);
  });

  it("文末が完結していれば 0.8 秒で話し終わり", () => {
    expect(decideTurnEnd({ ...base, now: base.lastVoiceAt! + 700 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...base, now: base.lastVoiceAt! + 800 }, p)).toEqual({ end: true, reason: "complete" });
  });

  it("文末が続きそうな形なら、最大待ち時間まで待つ", () => {
    const signals = { ...base, text: "前職では営業を担当していて、" };
    expect(decideTurnEnd({ ...signals, now: base.lastVoiceAt! + 4_000 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...signals, now: base.lastVoiceAt! + 5_000 }, p)).toEqual({ end: true, reason: "max_wait" });
  });

  it("どちらとも言えない文末は 2.5 秒で話し終わり", () => {
    const signals = { ...base, text: "理由としては" };
    expect(decideTurnEnd({ ...signals, now: base.lastVoiceAt! + 2_400 }, p).end).toBe(false);
    expect(decideTurnEnd({ ...signals, now: base.lastVoiceAt! + 2_500 }, p)).toEqual({ end: true, reason: "neutral" });
  });

  it("発話の上限に達したら、話している途中でも区切る", () => {
    expect(decideTurnEnd({ ...base, voiceActive: true, now: base.speechStartedAt! + 180_000 }, p)).toEqual({
      end: true,
      reason: "max_utterance",
    });
  });

  it("「やさしい」スタイルでは待ち時間を 1.5 倍にする", () => {
    const gentle = paramsForStyle("gentle");
    expect(gentle.completeWaitMs).toBe(1200);
    expect(decideTurnEnd({ ...base, now: base.lastVoiceAt! + 1_000 }, gentle).end).toBe(false);
    expect(paramsForStyle("strict")).toBe(DEFAULT_TURN_PARAMS);
  });
});
