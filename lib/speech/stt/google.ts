import { INTERVIEW_PHRASES, MEDICAL_PHRASES } from "@/lib/speech/phrases";

/**
 * Google Cloud Speech-to-Text(REST v1 の speech:recognize)。ブラウザが話の区切りごとに送る音声を文字にする。
 * どのブラウザ(Safari・スマホを含む)でも同じ精度で使えるよう、ブラウザ標準の音声認識の代わりに使う(設計書 14.1)。
 * API キーは GOOGLE_STT_API_KEY(未設定なら音声合成と同じ GOOGLE_TTS_API_KEY)。キーは URL に入れず、ヘッダーで送る。
 */

const DEFAULT_BASE_URL = "https://speech.googleapis.com";

export function googleSttApiKey(): string | null {
  return process.env.GOOGLE_STT_API_KEY?.trim() || process.env.GOOGLE_TTS_API_KEY?.trim() || null;
}

export function isGoogleSttConfigured(): boolean {
  return googleSttApiKey() !== null;
}

/** API が有効になっていない・キーで許可されていないなど、設定を直さない限り使えない */
export class GoogleSttUnavailableError extends Error {}

/** 送る音声:16kHz・16bit・モノラルの PCM */
export const STT_SAMPLE_RATE = 16000;

type Options = { phrases?: string[]; signal?: AbortSignal };

/**
 * 言葉の後押しの強さ。応募先の社名など、その面接に固有の言葉(質問計画から取り出したもの)を最も強くし、
 * 面接全般・医療職でよく使う言葉は、ほかの言葉を押しのけないよう弱めにする(数が多い医療の言葉は特に弱く)。
 */
const SESSION_BOOST = 15;
const COMMON_BOOST = 5;
const MEDICAL_BOOST = 4;

type Settings = { boost: boolean; model: boolean; punctuation: boolean };
/** 断られた設定(同じキーでは次から送らない) */
const unsupported = new Set<keyof Settings>();

export async function recognizeGoogle(apiKey: string, pcm: Buffer, { phrases = [], signal }: Options = {}): Promise<string> {
  const settings: Settings = { boost: !unsupported.has("boost"), model: !unsupported.has("model"), punctuation: !unsupported.has("punctuation") };
  let response = await request(apiKey, pcm, phrases, settings, signal);
  // 言葉の後押し・長い話向けのモデル・句読点の自動挿入に対応していない場合は、外してもう一度試し、外したことを覚えておく
  for (const key of ["boost", "model", "punctuation"] as const) {
    if (response.status !== 400 || !settings[key]) continue;
    console.warn(`google stt rejected ${key}, retrying without it`, await errorDetail(response));
    settings[key] = false;
    unsupported.add(key);
    response = await request(apiKey, pcm, phrases, settings, signal);
  }
  if (response.status === 403 || response.status === 401) {
    throw new GoogleSttUnavailableError(`Google ${response.status}: ${await errorDetail(response)}`);
  }
  if (!response.ok) throw new Error(`音声認識に失敗しました(Google ${response.status}: ${await errorDetail(response)})`);
  const body = (await response.json()) as { results?: { alternatives?: { transcript?: string }[] }[] };
  return joinTranscripts((body.results ?? []).map((result) => result.alternatives?.[0]?.transcript ?? ""));
}

function request(apiKey: string, pcm: Buffer, phrases: string[], settings: Settings, signal?: AbortSignal) {
  const contexts = [
    { phrases, boost: SESSION_BOOST },
    { phrases: INTERVIEW_PHRASES, boost: COMMON_BOOST },
    { phrases: MEDICAL_PHRASES, boost: MEDICAL_BOOST },
  ]
    .filter((context) => context.phrases.length > 0)
    .map((context) => (settings.boost ? context : { phrases: context.phrases }));
  return fetch(`${baseUrl()}/v1/speech:recognize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: STT_SAMPLE_RATE,
        languageCode: "ja-JP",
        ...(settings.model ? { model: "latest_long" } : {}),
        ...(settings.punctuation ? { enableAutomaticPunctuation: true } : {}),
        // 応募先の社名・職種や、面接でよく使う言葉を認識しやすくする
        speechContexts: contexts,
      },
      audio: { content: pcm.toString("base64") },
    }),
    signal,
  });
}

/** 区切りごとの結果をつなぐ。日本語の文字の前後に入った空白は取り除く(英単語どうしの間の空白は残す) */
export function joinTranscripts(parts: string[]): string {
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .replace(/([^\x00-\x7F]) /g, "$1")
    .replace(/ (?=[^\x00-\x7F])/g, "")
    .trim();
}

function baseUrl(): string {
  // GOOGLE_STT_BASE_URL は自動テストで模擬サーバーを使うときだけ設定する
  return process.env.GOOGLE_STT_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE_URL;
}

async function errorDetail(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message?.slice(0, 200) ?? response.statusText;
}
