/** 面接官の声(F-04-9)。ブラウザとサーバーの両方から参照する */
export type VoiceOption = { id: string; label: string; azureName: string };

export const VOICES: VoiceOption[] = [
  { id: "female_a", label: "女性A", azureName: "ja-JP-NanamiNeural" },
  { id: "male_a", label: "男性A", azureName: "ja-JP-KeitaNeural" },
  { id: "female_b", label: "女性B", azureName: "ja-JP-MayuNeural" },
  { id: "male_b", label: "男性B", azureName: "ja-JP-DaichiNeural" },
];

export function findVoice(id: string): VoiceOption {
  return VOICES.find((v) => v.id === id) ?? VOICES[0];
}

export const STT_PROVIDERS = ["webspeech", "azure", "text"] as const;
export type SttProvider = (typeof STT_PROVIDERS)[number];
export const STT_PROVIDER_LABELS: Record<SttProvider, string> = {
  webspeech: "ブラウザ標準(Web Speech API)",
  azure: "Azure AI Speech",
  text: "テキスト入力(マイクなし)",
};

export const TTS_PROVIDERS = ["browser", "azure", "mock"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];
export const TTS_PROVIDER_LABELS: Record<TtsProvider, string> = {
  browser: "ブラウザ標準(speechSynthesis)",
  azure: "Azure AI Speech",
  mock: "テスト音(発話時間ぶんの信号音)",
};
