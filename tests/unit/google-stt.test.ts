import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCloudStt } from "@/features/interview/client/stt/google";
import { INTERVIEW_PHRASES, MEDICAL_PHRASES } from "@/lib/speech/phrases";
import { GoogleSttUnavailableError, joinTranscripts, recognizeGoogle } from "@/lib/speech/stt/google";

describe("recognizeGoogle(サーバー)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const pcm = Buffer.from(new Int16Array([0, 1000, -1000, 0]).buffer);

  it("16kHz の PCM と認識しやすくしたい言葉を送り、結果をつなぐ。API キーはヘッダーで送る", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ results: [{ alternatives: [{ transcript: "営業職として" }] }, { alternatives: [{ transcript: " 5年間働きました。" }] }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const text = await recognizeGoogle("key-1", pcm, { phrases: ["法人営業"] });
    expect(text).toBe("営業職として5年間働きました。");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://speech.googleapis.com/v1/speech:recognize");
    expect(url).not.toContain("key-1");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("key-1");
    const body = JSON.parse(init.body as string);
    expect(body.config).toEqual({
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "ja-JP",
      model: "latest_long",
      enableAutomaticPunctuation: true,
      speechContexts: [
        { phrases: ["法人営業"], boost: 15 },
        { phrases: INTERVIEW_PHRASES, boost: 5 },
        { phrases: MEDICAL_PHRASES, boost: 4 },
      ],
    });
    expect(Buffer.from(body.audio.content, "base64").equals(pcm)).toBe(true);
  });

  it("言葉の後押し(boost)を断られたら、言葉だけを渡してもう一度試す", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "boost is not supported" } }, { status: 400 }))
      .mockImplementation(async () => Response.json({ results: [{ alternatives: [{ transcript: "はい" }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await recognizeGoogle("key-3", pcm, { phrases: ["法人営業"] })).toBe("はい");
    const retried = JSON.parse(fetchMock.mock.calls[1][1].body).config;
    expect(retried.speechContexts).toEqual([{ phrases: ["法人営業"] }, { phrases: INTERVIEW_PHRASES }, { phrases: MEDICAL_PHRASES }]);
    expect(retried.model).toBe("latest_long");
  });

  it("API が有効になっていない・キーで許可されていない場合は、設定の問題として知らせる", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "Cloud Speech-to-Text API has not been used" } }, { status: 403 })));
    await expect(recognizeGoogle("key-2", pcm)).rejects.toBeInstanceOf(GoogleSttUnavailableError);
  });

  it("日本語の文字の前後に入った空白は取り除き、英単語どうしの間の空白は残す", () => {
    expect(joinTranscripts(["はい ", "そう です", "。 Excel と Power BI を使いました"])).toBe("はいそうです。ExcelとPower BIを使いました");
    expect(joinTranscripts(["Power", "BI"])).toBe("Power BI");
  });
});

/** 声(0.1 の正弦波)と無音を、50ミリ秒ずつの PCM にする */
function frames(kind: "voice" | "silence", ms: number): Int16Array[] {
  return Array.from({ length: ms / 50 }, () =>
    Int16Array.from({ length: 800 }, (_, i) => (kind === "voice" ? Math.round(3277 * Math.sin((2 * Math.PI * 220 * i) / 16000)) : 0)),
  );
}

describe("GoogleCloudStt(ブラウザ)", () => {
  function setup(recognize: (pcm: Int16Array) => Promise<string>) {
    const finals: string[] = [];
    const errors: { message: string; fatal?: boolean }[] = [];
    const calls: number[] = [];
    const stt = new GoogleCloudStt(async (pcm) => {
      calls.push(pcm.length);
      return recognize(pcm);
    }, ["営業"]);
    const handlers = { onPartial: () => undefined, onFinal: (t: string) => finals.push(t), onError: (message: string, fatal?: boolean) => errors.push({ message, fatal }) };
    return { stt, finals, errors, calls, handlers, send: (list: Int16Array[]) => list.forEach((f) => stt.sendAudio(f)) };
  }

  it("話の短い間ごとに区切って送り、結果を確定した文字として渡す(区切りの前の音も少し含める)", async () => {
    const t = setup(async (pcm) => (pcm.length > 1600 ? "はい、営業職です。" : ""));
    await t.stt.connect(t.handlers);
    t.send([...frames("silence", 500), ...frames("voice", 1000), ...frames("silence", 600)]);
    await t.stt.flush();
    expect(t.calls.slice(1)).toHaveLength(1);
    const seconds = t.calls[1] / 16000;
    // 声の前の0.5秒 + 声1秒 + 区切りの間0.5秒
    expect(seconds).toBeGreaterThan(1.8);
    expect(seconds).toBeLessThan(2.2);
    expect(t.finals).toEqual(["はい、営業職です。"]);
  });

  it("話し終わりを確定する前に flush すると、話している途中の音声も送って結果を待つ", async () => {
    let resolve: (text: string) => void = () => undefined;
    const t = setup(async (pcm) => (pcm.length > 1600 ? new Promise<string>((r) => (resolve = r)) : ""));
    await t.stt.connect(t.handlers);
    t.send(frames("voice", 800));
    const flushed = t.stt.flush();
    await Promise.resolve();
    resolve("以上です。");
    await flushed;
    expect(t.finals).toEqual(["以上です。"]);
  });

  it("一時停止した後に届いた結果(前の回答のもの)は使わない", async () => {
    let resolve: (text: string) => void = () => undefined;
    const t = setup(async (pcm) => (pcm.length > 1600 ? new Promise<string>((r) => (resolve = r)) : ""));
    await t.stt.connect(t.handlers);
    t.send([...frames("voice", 800), ...frames("silence", 600)]);
    t.stt.pause();
    resolve("遅れて届いた結果");
    await t.stt.flush();
    expect(t.finals).toEqual([]);
  });

  it("API が使えないと準備の段階で分かったら、使えないことを知らせる", async () => {
    const t = setup(async () => {
      throw Object.assign(new Error("Google Cloud の音声認識を使えません"), { code: "STT_UNAVAILABLE" });
    });
    await t.stt.connect(t.handlers);
    expect(t.errors).toEqual([{ message: "Google Cloud の音声認識を使えません", fatal: true }]);
    t.send([...frames("voice", 800), ...frames("silence", 600)]);
    expect(t.calls).toHaveLength(1);
  });

  it("一時的な失敗が3回続いたら、使えないとみなす", async () => {
    const t = setup(async (pcm) => {
      if (pcm.length <= 1600) return "";
      throw Object.assign(new Error("通信に失敗しました"), { code: "STT_FAILED" });
    });
    await t.stt.connect(t.handlers);
    for (let i = 0; i < 3; i++) {
      t.send([...frames("voice", 800), ...frames("silence", 600)]);
      await t.stt.flush();
    }
    expect(t.errors.map((e) => e.fatal ?? false)).toEqual([false, false, true]);
  });
});
