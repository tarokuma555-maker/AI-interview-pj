import type { TtsProvider } from "@/lib/speech/voices";
import { AzureTts } from "./azure";
import { MockTts } from "./mock";
import type { TtsClient } from "./types";

export function isAzureSpeechConfigured(): boolean {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

/** サーバーで音声合成するサービスを返す。"browser" はブラウザ側で読み上げるので null */
export function getTtsClient(provider: TtsProvider): TtsClient | null {
  switch (provider) {
    case "azure":
      if (!isAzureSpeechConfigured()) throw new Error("Azure AI Speech が設定されていません");
      return new AzureTts(process.env.AZURE_SPEECH_KEY!, process.env.AZURE_SPEECH_REGION!);
    case "mock":
      return new MockTts();
    case "browser":
      return null;
  }
}
