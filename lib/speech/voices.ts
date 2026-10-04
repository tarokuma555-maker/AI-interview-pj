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

/** 自然に聞こえる高品質な声(Microsoft Edge の「Online (Natural)」、Apple の「拡張」「プレミアム」など) */
const NATURAL_VOICE = /natural|online|neural|enhanced|premium|拡張|プレミアム/i;

/**
 * ブラウザ標準の読み上げで使う日本語の声を選ぶ。アバターの性別に合う声を優先し、その中でも高品質な声を優先する。
 * 合う声がなければ、日本語の声のうち高品質なもの、それもなければ最初の日本語の声を使う。
 */
export function pickBrowserVoice<T extends { name: string; lang: string }>(voices: T[], gender?: VoiceGender): T | undefined {
  const japanese = voices.filter((v) => v.lang.toLowerCase().startsWith("ja"));
  const best = (list: T[]) => list.find((v) => NATURAL_VOICE.test(v.name)) ?? list[0];
  const matching =
    gender === "male"
      ? japanese.filter((v) => MALE_VOICE.test(v.name) && !/female/i.test(v.name))
      : gender === "female"
        ? japanese.filter((v) => FEMALE_VOICE.test(v.name))
        : [];
  return best(matching) ?? best(japanese);
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

export const TTS_PROVIDERS = ["browser", "google", "azure", "mock"] as const;
export type TtsProvider = (typeof TTS_PROVIDERS)[number];
export const TTS_PROVIDER_LABELS: Record<TtsProvider, string> = {
  browser: "ブラウザ標準(speechSynthesis)",
  google: "Google Cloud(Text-to-Speech)",
  azure: "Azure AI Speech",
  mock: "テスト音(発話時間ぶんの信号音)",
};

/** 声の高さ(半音)と話す速さ(倍率)の調整範囲 */
export const VOICE_PITCH_RANGE = { min: -6, max: 6, step: 1 } as const;
export const VOICE_RATE_RANGE = { min: 0.8, max: 1.2, step: 0.05 } as const;

/** ブラウザ標準の読み上げの高さ(0〜2、1が標準)に、半音の調整を近づけて当てはめる */
export function browserPitch(semitones: number | undefined): number {
  return Math.min(2, Math.max(0.5, 2 ** ((semitones ?? 0) / 12)));
}
