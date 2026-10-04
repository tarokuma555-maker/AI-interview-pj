import type { SynthesizedAudio, TtsClient } from "./types";

/**
 * 音声合成サービスなしで再生の流れを確認するためのテスト音。
 * 発話にかかるはずの時間(1文字あたり0.12秒)の WAV を作り、先頭だけ短い信号音を入れる。
 */
export class MockTts implements TtsClient {
  async synthesize(text: string): Promise<SynthesizedAudio> {
    const seconds = Math.min(15, Math.max(0.6, text.length * 0.12));
    return { format: "wav", data: makeWav(seconds), characters: text.length };
  }
}

const SAMPLE_RATE = 8000;

export function makeWav(seconds: number): Uint8Array {
  const samples = Math.round(seconds * SAMPLE_RATE);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * 2, true);
  const beepSamples = Math.round(0.08 * SAMPLE_RATE);
  for (let i = 0; i < beepSamples; i++) {
    view.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 660 * i) / SAMPLE_RATE) * 3000), true);
  }
  return new Uint8Array(buffer);
}
