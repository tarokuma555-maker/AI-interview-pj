import { describe, expect, it } from "vitest";
import { percentile, summarize, type LatencyRecord } from "@/features/interview/client/latency";
import { NdjsonParser } from "@/features/interview/client/ndjson";
import { EnergyVad } from "@/features/interview/client/vad";
import { charsPerMinute, countSpokenChars } from "@/lib/interview/speech-metrics";

describe("NdjsonParser", () => {
  it("行の途中で分かれて届いても、1行ずつ取り出す", () => {
    const parser = new NdjsonParser<{ n: number }>();
    expect(parser.push('{"n":1}\n{"n"')).toEqual([{ n: 1 }]);
    expect(parser.push(":2}\n\n")).toEqual([{ n: 2 }]);
    expect(parser.push('{"n":3}')).toEqual([]);
    expect(parser.flush()).toEqual([{ n: 3 }]);
  });
});

describe("EnergyVad", () => {
  const quiet = 0.001; // 約 -60dB
  const loud = 0.1; // 約 -20dB

  it("一定時間以上の大きな音で話し始め、無音が続いたら話し終わりとする", () => {
    const vad = new EnergyVad();
    let t = 0;
    for (let i = 0; i < 10; i++) vad.process(quiet, 50, (t += 50));
    expect(vad.process(loud, 50, (t += 50))).toBeNull();
    expect(vad.process(loud, 50, (t += 50))).toEqual({ type: "start", at: t - 50 });
    const lastVoice = t;
    for (let i = 0; i < 5; i++) vad.process(quiet, 50, (t += 50));
    expect(vad.isSpeaking).toBe(true); // 無音 250 ミリ秒ではまだ話している途中とみなす
    expect(vad.process(quiet, 50, (t += 50))).toEqual({ type: "end", at: lastVoice });
    expect(vad.isSpeaking).toBe(false);
    expect(vad.lastVoiceTime).toBe(lastVoice);
    expect(vad.totalVoiceMs).toBe(100);
  });

  it("最初から大きな雑音がある部屋でも、やがて雑音として扱う", () => {
    const vad = new EnergyVad();
    let t = 0;
    const noisy = 0.01; // 約 -40dB の雑音が続く
    for (let i = 0; i < 20 * 60; i++) vad.process(noisy, 50, (t += 50)); // 1分間
    expect(vad.isSpeaking).toBe(false);
  });

  it("一瞬の物音では話し始めとしない", () => {
    const vad = new EnergyVad();
    let t = 0;
    for (let i = 0; i < 10; i++) vad.process(quiet, 50, (t += 50));
    vad.process(loud, 50, (t += 50));
    vad.process(quiet, 50, (t += 50));
    expect(vad.isSpeaking).toBe(false);
  });
});

describe("latency", () => {
  it("中央値と P95 を求める", () => {
    expect(percentile([3, 1, 2], 50)).toBe(2);
    expect(percentile([], 50)).toBeNull();
    const records = [1000, 2000, 3000, null].map(
      (totalMs, i): LatencyRecord => ({ turn: i + 1, reason: "complete", detectMs: null, responseMs: null, totalMs, server: null, usage: null }),
    );
    expect(summarize(records)).toEqual({ count: 3, median: 2000, p95: 3000 });
  });
});

describe("speech-metrics", () => {
  it("句読点と空白を除いて数える(長音は数える)", () => {
    expect(countSpokenChars("はい、コーヒーです。")).toBe(8);
  });

  it("発話が短すぎる場合は話す速さを計算しない", () => {
    expect(charsPerMinute("はい。", 1000)).toBeUndefined();
    expect(charsPerMinute("あ".repeat(300), 60_000)).toBe(300);
  });
});
