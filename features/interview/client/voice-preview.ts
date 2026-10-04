import type { VoiceRequest } from "@/lib/speech/tts/types";
import type { TtsProvider, VoiceGender } from "@/lib/speech/voices";
import { fetchPhraseAudio } from "./poc-api";
import { applyBrowserVoice } from "./speaker";

/**
 * 設定画面の「声を試す」。選んだ音声合成・声・調整で、面接官の最初のあいさつを読み上げる。
 */

let current: HTMLAudioElement | null = null;

export async function previewVoice(options: {
  accessCode: string;
  provider: TtsProvider;
  voice: VoiceRequest;
  gender?: VoiceGender;
  text: string;
}): Promise<void> {
  stopPreview();
  const { provider, voice, text } = options;
  if (provider === "browser") {
    if (typeof speechSynthesis === "undefined") throw new Error("このブラウザは読み上げに対応していません");
    const utterance = new SpeechSynthesisUtterance(text);
    applyBrowserVoice(utterance, { gender: options.gender, pitch: voice.pitch, rate: voice.rate });
    speechSynthesis.speak(utterance);
    return;
  }
  const data = await fetchPhraseAudio(options.accessCode, text, voice, provider);
  const url = URL.createObjectURL(new Blob([data], { type: provider === "mock" ? "audio/wav" : "audio/mpeg" }));
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  current = audio;
  await audio.play();
}

export function stopPreview() {
  current?.pause();
  current = null;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
