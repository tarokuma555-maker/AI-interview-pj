import { findVoice } from "@/lib/speech/voices";
import type { SynthesizedAudio, TtsClient, VoiceRequest } from "./types";

/** Azure AI Speech の音声合成(REST)。MP3(24kHz・モノラル)で受け取る */
export class AzureTts implements TtsClient {
  constructor(
    private readonly key: string,
    private readonly region: string,
  ) {}

  async synthesize(text: string, request: VoiceRequest, signal?: AbortSignal): Promise<SynthesizedAudio> {
    const voice = findVoice(request.id);
    const ssml = `<speak version="1.0" xml:lang="ja-JP"><voice name="${voice.azureName}">${withProsody(escapeXml(text), request)}</voice></speak>`;
    const response = await fetch(`https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "ai-interview-pj",
      },
      body: ssml,
      signal,
    });
    if (!response.ok) {
      throw new Error(`音声合成に失敗しました(Azure ${response.status})`);
    }
    return { format: "mp3", data: new Uint8Array(await response.arrayBuffer()), characters: text.length };
  }
}

/** 声の高さ(半音)と話す速さ(倍率)の調整。調整がなければそのまま */
export function withProsody(content: string, { pitch, rate }: VoiceRequest): string {
  const attributes = [
    pitch ? `pitch="${pitch > 0 ? "+" : ""}${pitch}st"` : "",
    rate !== undefined && rate !== 1 ? `rate="${Math.round((rate - 1) * 100) > 0 ? "+" : ""}${Math.round((rate - 1) * 100)}%"` : "",
  ].filter(Boolean);
  return attributes.length ? `<prosody ${attributes.join(" ")}>${content}</prosody>` : content;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
