import type { VoiceGender } from "./voices";

/**
 * Google Cloud の音声合成で使う日本語の声の一覧(サーバーと設定画面の両方から使う。設計書 10)。
 */

export type GoogleVoiceTier = "chirp3-hd" | "neural2" | "wavenet";

export type GoogleVoice = {
  /** Google の声の名前(例: ja-JP-Chirp3-HD-Charon)。面接設定の voiceId にそのまま使う */
  id: string;
  label: string;
  gender: VoiceGender;
  tier: GoogleVoiceTier;
};

/** 使う声の種類(自然な順)。Standard などの古い声は使わない */
const TIERS: { tier: GoogleVoiceTier; pattern: RegExp; label: string }[] = [
  { tier: "chirp3-hd", pattern: /^ja-JP-Chirp3-HD-(.+)$/, label: "Chirp 3 HD・最も自然" },
  { tier: "neural2", pattern: /^ja-JP-Neural2-(.+)$/, label: "Neural2" },
  { tier: "wavenet", pattern: /^ja-JP-Wavenet-(.+)$/, label: "WaveNet・低価格" },
];

export type RawGoogleVoice = { name?: string; ssmlGender?: string; languageCodes?: string[] };

/** voices.list の結果から、日本語の男性・女性の声を、自然な順に並べる */
export function toGoogleVoices(raw: RawGoogleVoice[]): GoogleVoice[] {
  const voices: GoogleVoice[] = [];
  for (const voice of raw) {
    if (!voice.name || !voice.languageCodes?.includes("ja-JP")) continue;
    const gender = voice.ssmlGender === "MALE" ? "male" : voice.ssmlGender === "FEMALE" ? "female" : null;
    const tier = TIERS.find((t) => t.pattern.test(voice.name!));
    if (!gender || !tier) continue;
    const shortName = tier.pattern.exec(voice.name)![1];
    voices.push({ id: voice.name, label: `${gender === "male" ? "男性" : "女性"} ${shortName}(${tier.label})`, gender, tier: tier.tier });
  }
  const order = (v: GoogleVoice) => TIERS.findIndex((t) => t.tier === v.tier);
  return voices.sort((a, b) => order(a) - order(b) || (a.gender === b.gender ? 0 : a.gender === "male" ? -1 : 1) || a.id.localeCompare(b.id));
}

/** 性別に合う最初の声(自然な順) */
export function defaultGoogleVoice(voices: GoogleVoice[], gender: VoiceGender): GoogleVoice | undefined {
  return voices.find((v) => v.gender === gender) ?? voices[0];
}
