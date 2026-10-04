/** 面接官の声(F-04-9)。ブラウザとサーバーの両方から参照する */
export type VoiceGender = "male" | "female";
export type VoiceOption = { id: string; label: string; azureName: string; gender: VoiceGender };

export const VOICES: VoiceOption[] = [
  { id: "female_a", label: "女性A", azureName: "ja-JP-NanamiNeural", gender: "female" },
  { id: "male_a", label: "男性A", azureName: "ja-JP-KeitaNeural", gender: "male" },
  { id: "female_b", label: "女性B", azureName: "ja-JP-MayuNeural", gender: "female" },
  { id: "male_b", label: "男性B", azureName: "ja-JP-DaichiNeural", gender: "male" },
];

/** ブラウザに入っている日本語の声のうち、名前から性別が分かるもの(OS・ブラウザごとの代表的な声) */
const MALE_VOICE = /otoya|ichiro|keita|daichi|naoki|hattori|male|男性/i;
const FEMALE_VOICE = /kyoko|haruka|ayumi|sayaka|nanami|mayu|aoi|shiori|o-ren|google|female|女性/i;

/**
 * ブラウザ標準の読み上げで使う日本語の声を選ぶ。アバターの性別に合う声があればそれを、なければ最初の日本語の声を使う。
 */
export function pickBrowserVoice<T extends { name: string; lang: string }>(voices: T[], gender?: VoiceGender): T | undefined {
  const japanese = voices.filter((v) => v.lang.toLowerCase().startsWith("ja"));
  if (gender === "male") return japanese.find((v) => MALE_VOICE.test(v.name) && !/female/i.test(v.name)) ?? japanese[0];
  if (gender === "female") return japanese.find((v) => FEMALE_VOICE.test(v.name)) ?? japanese[0];
  return japanese[0];
}

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
