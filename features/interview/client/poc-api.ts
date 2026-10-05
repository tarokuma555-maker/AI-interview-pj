import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { CandidateContext, SessionSettings, SessionState, TurnEvent, TurnRecord } from "@/lib/interview/types";
import type { GoogleVoice } from "@/lib/speech/google-voices";
import type { VoiceRequest } from "@/lib/speech/tts/types";
import type { TtsProvider } from "@/lib/speech/voices";
import { NdjsonParser } from "./ndjson";

/** 試作版 API(/api/poc/*)の呼び出し。アクセスコードをヘッダーに付ける */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code?: string,
  ) {
    super(message);
  }
}

export type PocConfig = {
  aiMode: "live" | "mock";
  azureSpeech: boolean;
  googleTts: boolean;
  googleStt: boolean;
  interviewerModels: { key: SessionSettings["interviewerModel"]; label: string }[];
  voices: { id: string; label: string }[];
};

function headers(code: string): HeadersInit {
  return { "Content-Type": "application/json", "x-poc-code": code };
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; retryable?: boolean; code?: string } } | null;
  return new ApiError(
    body?.error?.message ?? `通信に失敗しました(${response.status})`,
    body?.error?.retryable ?? response.status >= 500,
    body?.error?.code,
  );
}

export async function fetchConfig(code: string): Promise<PocConfig> {
  const response = await fetch("/api/poc/config", { headers: headers(code) });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as PocConfig;
}

export async function fetchPlan(code: string, settings: SessionSettings, context: CandidateContext): Promise<QuestionPlan> {
  const response = await fetch("/api/poc/plan", { method: "POST", headers: headers(code), body: JSON.stringify({ settings, context }) });
  if (!response.ok) throw await toApiError(response);
  return ((await response.json()) as { plan: QuestionPlan }).plan;
}

export async function fetchSttToken(code: string): Promise<{ token: string; region: string; expiresAt: number }> {
  const response = await fetch("/api/poc/stt-token", { method: "POST", headers: headers(code) });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as { token: string; region: string; expiresAt: number };
}

/** 話の区切りごとの音声(16kHz・16bit・モノラルの PCM)を、Google Cloud の音声認識で文字にする */
export async function recognizeSpeech(code: string, pcm: Int16Array, keywords: string[]): Promise<string> {
  const response = await fetch("/api/poc/stt", {
    method: "POST",
    headers: headers(code),
    body: JSON.stringify({ audio: toBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)), keywords }),
  });
  if (!response.ok) throw await toApiError(response);
  return ((await response.json()) as { text: string }).text;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** サーバーで音声を合成するサービス */
export type ServerTtsProvider = Exclude<TtsProvider, "browser">;

export async function fetchPhraseAudio(code: string, text: string, voice: VoiceRequest, provider: ServerTtsProvider): Promise<ArrayBuffer> {
  const response = await fetch("/api/poc/tts", {
    method: "POST",
    headers: headers(code),
    body: JSON.stringify({ text, voiceId: voice.id, pitch: voice.pitch, rate: voice.rate, provider }),
  });
  if (!response.ok) throw await toApiError(response);
  return response.arrayBuffer();
}

/** Google Cloud の音声合成で使える日本語の声 */
export async function fetchGoogleVoices(code: string): Promise<GoogleVoice[]> {
  const response = await fetch("/api/poc/voices", { headers: headers(code) });
  if (!response.ok) throw await toApiError(response);
  return ((await response.json()) as { voices: GoogleVoice[] }).voices;
}

export type TurnRequestBody = {
  kind: "start" | "answer" | "continue";
  settings: SessionSettings;
  context: CandidateContext;
  plan: QuestionPlan;
  history: TurnRecord[];
  state: SessionState;
  answer?: { text: string; inputMode: "voice" | "text"; speechMs?: number; responseDelayMs?: number };
  previous?: { playedSentences: number; interrupted: boolean };
  reply: boolean;
  ttsProvider: TtsProvider;
};

/** /turns を呼び、NDJSON のイベントを1つずつ onEvent に渡す */
export async function postTurn(code: string, body: TurnRequestBody, signal: AbortSignal, onEvent: (event: TurnEvent) => void) {
  const response = await fetch("/api/poc/turns", { method: "POST", headers: headers(code), body: JSON.stringify(body), signal });
  if (!response.ok || !response.body) throw await toApiError(response);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new NdjsonParser<TurnEvent>();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    for (const event of parser.push(value)) onEvent(event);
  }
  for (const event of parser.flush()) onEvent(event);
}
