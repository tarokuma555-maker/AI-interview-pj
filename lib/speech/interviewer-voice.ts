import { defaultGoogleVoice } from "./google-voices";
import { isGoogleTtsConfigured } from "./tts";
import { listGoogleVoices } from "./tts/google";
import { VOICES } from "./voices";

/**
 * 製品版の面接官の声(要件 D-10、D-13)。利用者は声を選ばず、サーバーが決めた声を全員に使う。
 * Google Cloud は環境変数 INTERVIEWER_VOICE_ID の声、なければ男性の最も自然な声(一覧の先頭)にする。
 */
export type InterviewerVoices = {
  /** Google Cloud の声の名前。Google Cloud が使えない・一覧を取れない場合は null */
  google: string | null;
  /** Azure AI Speech の声(VOICES の id) */
  azure: string;
};

const CACHE_MS = 6 * 60 * 60 * 1000;
let cached: { id: string | null; at: number } | null = null;

export async function interviewerVoices(signal?: AbortSignal): Promise<InterviewerVoices> {
  return { google: await googleVoice(signal), azure: VOICES.find((v) => v.gender === "male")?.id ?? VOICES[0].id };
}

async function googleVoice(signal?: AbortSignal): Promise<string | null> {
  if (!isGoogleTtsConfigured()) return null;
  const configured = process.env.INTERVIEWER_VOICE_ID?.trim();
  if (configured) return configured;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.id;
  try {
    const voices = await listGoogleVoices(process.env.GOOGLE_TTS_API_KEY!.trim(), signal);
    const id = defaultGoogleVoice(voices, "male")?.id ?? null;
    cached = { id, at: Date.now() };
    return id;
  } catch (error) {
    // 一覧を取れないときは覚えず、次のリクエストでやり直す
    console.error("google voices failed", error);
    return null;
  }
}
