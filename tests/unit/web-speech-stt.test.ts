import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isWebSpeechSupported, WebSpeechStt } from "@/features/interview/client/stt/web-speech";

/** ブラウザの音声認識の代わり。start の回数を数え、エラー・結果・終了を外から起こせる */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  starts = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    this.starts++;
  }
  stop() {}
  abort() {}
  /** エラーのあとに認識が終わる(ブラウザと同じ順番) */
  fail(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }
}

function setup() {
  const errors: { message: string; fatal?: boolean }[] = [];
  const stt = new WebSpeechStt();
  void stt.connect({ onPartial: () => undefined, onFinal: () => undefined, onError: (message, fatal) => errors.push({ message, fatal }) });
  return { stt, errors, recognition: FakeRecognition.instances.at(-1)! };
}

describe("WebSpeechStt", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal("window", { webkitSpeechRecognition: FakeRecognition });
    vi.stubGlobal("navigator", {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("接続の失敗が続いたら、つなぎ直すのをやめて、使えないことを知らせる", () => {
    const { errors, recognition } = setup();
    expect(recognition.starts).toBe(1);
    recognition.fail("network");
    vi.advanceTimersByTime(600);
    recognition.fail("network");
    vi.advanceTimersByTime(600);
    // 2回までは知らせずにつなぎ直す
    expect(recognition.starts).toBe(3);
    expect(errors).toEqual([]);
    recognition.fail("network");
    vi.advanceTimersByTime(600);
    expect(recognition.starts).toBe(3);
    expect(errors).toHaveLength(1);
    expect(errors[0].fatal).toBe(true);
    expect(errors[0].message).toContain("Google Chrome");
  });

  it("途中で認識できれば、一時的な失敗として数え直す", () => {
    const { errors, recognition } = setup();
    for (let i = 0; i < 4; i++) {
      recognition.fail("network");
      vi.advanceTimersByTime(600);
      recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "はい" } }] });
    }
    expect(errors).toEqual([]);
    expect(recognition.starts).toBe(5);
  });

  it("マイクが許可されていないなど、すぐに使えないと分かるエラーは、その場で知らせる", () => {
    const { errors, recognition } = setup();
    recognition.fail("not-allowed");
    vi.advanceTimersByTime(600);
    expect(recognition.starts).toBe(1);
    expect(errors).toEqual([{ message: expect.stringContaining("マイクの使用が許可されていない"), fatal: true }]);
  });

  it("Brave では使えないものとして扱う", () => {
    expect(isWebSpeechSupported()).toBe(true);
    vi.stubGlobal("navigator", { brave: {} });
    expect(isWebSpeechSupported()).toBe(false);
  });
});
