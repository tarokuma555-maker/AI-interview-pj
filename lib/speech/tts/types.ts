import type { AudioFormat } from "@/lib/interview/types";

export type SynthesizedAudio = { format: AudioFormat; data: Uint8Array; characters: number };

/** サーバー側の音声合成。サービスごとの違いをこのインターフェースで吸収する(設計書 10) */
export interface TtsClient {
  synthesize(text: string, voiceId: string, signal?: AbortSignal): Promise<SynthesizedAudio>;
}
