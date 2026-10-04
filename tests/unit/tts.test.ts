import { afterEach, describe, expect, it, vi } from "vitest";
import { withProsody } from "@/lib/speech/tts/azure";
import { defaultGoogleVoice, toGoogleVoices } from "@/lib/speech/google-voices";
import { GoogleTts } from "@/lib/speech/tts/google";
import { browserPitch } from "@/lib/speech/voices";

const RAW_VOICES = [
  { name: "ja-JP-Standard-C", ssmlGender: "MALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Wavenet-D", ssmlGender: "MALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Wavenet-B", ssmlGender: "FEMALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Chirp3-HD-Aoede", ssmlGender: "FEMALE", languageCodes: ["ja-JP"] },
  { name: "ja-JP-Chirp3-HD-Charon", ssmlGender: "MALE", languageCodes: ["ja-JP"] },
  { name: "en-US-Chirp3-HD-Charon", ssmlGender: "MALE", languageCodes: ["en-US"] },
];

describe("Google の声の一覧", () => {
  it("日本語の Chirp 3 HD・Neural2・WaveNet だけを、自然な順(同じ種類なら男性が先)に並べる", () => {
    const voices = toGoogleVoices(RAW_VOICES);
    expect(voices.map((v) => v.id)).toEqual(["ja-JP-Chirp3-HD-Charon", "ja-JP-Chirp3-HD-Aoede", "ja-JP-Wavenet-D", "ja-JP-Wavenet-B"]);
    expect(voices[0]).toMatchObject({ gender: "male", tier: "chirp3-hd", label: "男性 Charon(Chirp 3 HD・最も自然)" });
    expect(defaultGoogleVoice(voices, "female")?.id).toBe("ja-JP-Chirp3-HD-Aoede");
  });
});

describe("GoogleTts", () => {
  afterEach(() => vi.unstubAllGlobals());

  const audio = Buffer.from("fake-mp3").toString("base64");

  it("声と調整を送り、MP3 を受け取る。API キーはヘッダーで送る", async () => {
    const fetchMock = vi.fn(async () => Response.json({ audioContent: audio }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new GoogleTts("key-1").synthesize("こんにちは", { id: "ja-JP-Wavenet-D", pitch: -2, rate: 0.9 });
    expect(Buffer.from(result.data).toString()).toBe("fake-mp3");
    expect(result.format).toBe("mp3");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(url).not.toContain("key-1");
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("key-1");
    expect(JSON.parse(init.body as string)).toEqual({
      input: { text: "こんにちは" },
      voice: { languageCode: "ja-JP", name: "ja-JP-Wavenet-D" },
      audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000, speakingRate: 0.9, pitch: -2 },
    });
  });

  it("高さの調整を断られたら、速さの調整は残してもう一度試し、次からその声には高さを送らない", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: { message: "pitch is not supported" } }, { status: 400 }))
      .mockImplementation(async () => Response.json({ audioContent: audio }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tts = new GoogleTts("key-2");
    await tts.synthesize("はい", { id: "ja-JP-Chirp3-HD-Charon", pitch: -3, rate: 0.9 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).audioConfig).toEqual({ audioEncoding: "MP3", sampleRateHertz: 24000, speakingRate: 0.9 });
    await tts.synthesize("いいえ", { id: "ja-JP-Chirp3-HD-Charon", pitch: -3, rate: 0.9 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).audioConfig.pitch).toBeUndefined();
  });

  it("Azure 用の声の指定(male_a など)なら、性別に合う Google の声を選ぶ", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/v1/voices") ? Response.json({ voices: RAW_VOICES }) : Response.json({ audioContent: audio }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await new GoogleTts("key-3").synthesize("はい", { id: "male_a" });
    const body = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body.voice.name).toBe("ja-JP-Chirp3-HD-Charon");
  });

  it("失敗したら、理由を含めてエラーにする", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { message: "API key not valid" } }, { status: 403 })));
    await expect(new GoogleTts("bad").synthesize("はい", { id: "ja-JP-Wavenet-D" })).rejects.toThrow("Google 403: API key not valid");
  });
});

describe("声の調整", () => {
  it("Azure では prosody で高さ(半音)と速さ(%)を指定し、調整がなければ付けない", () => {
    expect(withProsody("こんにちは", { id: "x", pitch: -2, rate: 0.9 })).toBe('<prosody pitch="-2st" rate="-10%">こんにちは</prosody>');
    expect(withProsody("こんにちは", { id: "x", pitch: 3 })).toBe('<prosody pitch="+3st">こんにちは</prosody>');
    expect(withProsody("こんにちは", { id: "x", rate: 1 })).toBe("こんにちは");
  });

  it("ブラウザ標準の読み上げでは、半音を高さの倍率に直す", () => {
    expect(browserPitch(undefined)).toBe(1);
    expect(browserPitch(-12)).toBe(0.5);
    expect(browserPitch(12)).toBe(2);
    expect(browserPitch(-2)).toBeCloseTo(0.891, 3);
  });
});
