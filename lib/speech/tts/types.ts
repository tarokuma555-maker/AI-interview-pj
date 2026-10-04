import type { AudioFormat } from "@/lib/interview/types";

export type SynthesizedAudio = { format: AudioFormat; data: Uint8Array; characters: number };

/** 使う声と調整。pitch は半音単位(0 で調整なし)、rate は話す速さの倍率(1 で調整なし) */
export type VoiceRequest = { id: string; pitch?: number; rate?: number };

/** サーバー側の音声合成。サービスごとの違いをこのインターフェースで吸収する(設計書 10) */
export interface TtsClient {
  synthesize(text: string, voice: VoiceRequest, signal?: AbortSignal): Promise<SynthesizedAudio>;
}
