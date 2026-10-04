import { defaultGoogleVoice, toGoogleVoices, type GoogleVoice, type RawGoogleVoice } from "@/lib/speech/google-voices";
import type { SynthesizedAudio, TtsClient, VoiceRequest } from "./types";

/**
 * Google Cloud Text-to-Speech(REST)。MP3(24kHz)で受け取る(設計書 10)。
 * API キーは環境変数 GOOGLE_TTS_API_KEY。キーは URL に入れず、ヘッダーで送る(ログに残さないため)。
 */

const DEFAULT_BASE_URL = "https://texttospeech.googleapis.com";

let cache: { key: string; at: number; voices: GoogleVoice[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export async function listGoogleVoices(apiKey: string, signal?: AbortSignal): Promise<GoogleVoice[]> {
  if (cache && cache.key === apiKey && Date.now() - cache.at < CACHE_MS) return cache.voices;
  const response = await fetch(`${baseUrl()}/v1/voices?languageCode=ja-JP`, { headers: { "X-Goog-Api-Key": apiKey }, signal });
  if (!response.ok) throw new Error(`声の一覧を取得できませんでした(Google ${response.status}: ${await errorDetail(response)})`);
  const body = (await response.json()) as { voices?: RawGoogleVoice[] };
  const voices = toGoogleVoices(body.voices ?? []);
  cache = { key: apiKey, at: Date.now(), voices };
  return voices;
}

/** 高さ・速さの調整を断られた声(同じ声では次から送らない) */
const unsupportedTuning = new Map<string, Set<"pitch" | "speakingRate">>();

export class GoogleTts implements TtsClient {
  constructor(private readonly apiKey: string) {}

  async synthesize(text: string, voice: VoiceRequest, signal?: AbortSignal): Promise<SynthesizedAudio> {
    const name = await this.resolveVoice(voice.id, signal);
    const skipped = unsupportedTuning.get(name) ?? new Set();
    const tuning: Record<string, number> = {};
    if (voice.rate !== undefined && voice.rate !== 1 && !skipped.has("speakingRate")) tuning.speakingRate = voice.rate;
    if (voice.pitch && !skipped.has("pitch")) tuning.pitch = voice.pitch;
    let response = await this.request(text, name, tuning, signal);
    // 声の種類によっては高さ・速さの調整に対応していないため、まず高さ、次に速さを外して試し、外した調整は覚えておく
    for (const key of ["pitch", "speakingRate"] as const) {
      if (response.status !== 400 || !(key in tuning)) continue;
      console.warn(`google tts rejected ${key} for ${name}, retrying without it`, await errorDetail(response));
      delete tuning[key];
      unsupportedTuning.set(name, new Set([...(unsupportedTuning.get(name) ?? []), key]));
      response = await this.request(text, name, tuning, signal);
    }
    if (!response.ok) throw new Error(`音声合成に失敗しました(Google ${response.status}: ${await errorDetail(response)})`);
    const body = (await response.json()) as { audioContent?: string };
    if (!body.audioContent) throw new Error("音声合成の結果が空でした(Google)");
    return { format: "mp3", data: new Uint8Array(Buffer.from(body.audioContent, "base64")), characters: text.length };
  }

  private request(text: string, name: string, tuning: Record<string, number>, signal?: AbortSignal) {
    return fetch(`${baseUrl()}/v1/text:synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ja-JP", name },
        audioConfig: { audioEncoding: "MP3", sampleRateHertz: 24000, ...tuning },
      }),
      signal,
    });
  }

  /** Google の声の名前でない場合(Azure 用の male_a など)は、性別に合う声を選ぶ */
  private async resolveVoice(id: string, signal?: AbortSignal): Promise<string> {
    if (id.startsWith("ja-JP-")) return id;
    const voices = await listGoogleVoices(this.apiKey, signal);
    const voice = defaultGoogleVoice(voices, id.startsWith("male") ? "male" : "female");
    if (!voice) throw new Error("使える日本語の声がありません(Google)");
    return voice.id;
  }
}

function baseUrl(): string {
  // GOOGLE_TTS_BASE_URL は自動テストで模擬サーバーを使うときだけ設定する
  return process.env.GOOGLE_TTS_BASE_URL?.replace(/\/$/, "") || DEFAULT_BASE_URL;
}

async function errorDetail(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message?.slice(0, 200) ?? response.statusText;
}
