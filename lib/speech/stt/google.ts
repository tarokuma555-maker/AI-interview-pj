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

/** 断られた設定(同じキーでは次から送らない) */
const unsupported = new Set<"model" | "punctuation">();

export async function recognizeGoogle(apiKey: string, pcm: Buffer, { phrases = [], signal }: Options = {}): Promise<string> {
  const settings = { model: !unsupported.has("model"), punctuation: !unsupported.has("punctuation") };
  let response = await request(apiKey, pcm, phrases, settings, signal);
  // 長い話向けのモデル・句読点の自動挿入に対応していない場合は、外してもう一度試し、外したことを覚えておく
  for (const key of ["model", "punctuation"] as const) {
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

function request(apiKey: string, pcm: Buffer, phrases: string[], settings: { model: boolean; punctuation: boolean }, signal?: AbortSignal) {
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
        // 会社名・職種などの言葉を認識しやすくする
        ...(phrases.length > 0 ? { speechContexts: [{ phrases }] } : {}),
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
