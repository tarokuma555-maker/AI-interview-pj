/**
 * 面接官の声に合わせた口の動き(設計書 3.12)。
 * サーバーで合成した音声は、再生中の音を解析して口の開きと形を決める。
 * ブラウザ標準の読み上げは音を取り出せないため、文章の母音から口の動きを作る。
 */

/** 口の開き(0〜1)と形(-1 すぼめる 〜 +1 横に広げる)。文章から作る場合は、発音中の母音も持つ */
export type MouthShape = { open: number; wide: number; vowel?: "a" | "i" | "u" | "e" | "o" };

/** 面接官の声の状態(Speaker が返す) */
export type VoiceState =
  | { kind: "none" }
  | { kind: "audio"; analyser: AnalyserNode }
  | { kind: "speech"; text: string; startedAt: number };

export const CLOSED_MOUTH: MouthShape = { open: 0, wide: 0 };

// ---- 音の解析 ---------------------------------------------------------------

const SILENCE_DB = -50;
const LOUD_DB = -16;
const BAND_LOW_HZ = 250;
const BAND_HIGH_HZ = 4000;

/**
 * 1フレーム分の音から、口の開き(音の大きさ)と口の形(音の高い成分の多さ)を求める。
 * 音の重心が高いと「い・え」のように横に広く、低いと「お・う」のようにすぼめた口に近づける。
 */
export function analyzeFrame(time: Float32Array, frequencyDb: Float32Array, sampleRate: number): MouthShape {
  let sum = 0;
  for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
  const rms = Math.sqrt(sum / Math.max(1, time.length));
  const db = 20 * Math.log10(rms + 1e-9);
  const open = clamp((db - SILENCE_DB) / (LOUD_DB - SILENCE_DB), 0, 1);
  if (open < 0.06) return CLOSED_MOUTH;

  const binHz = sampleRate / 2 / frequencyDb.length;
  let weighted = 0;
  let total = 0;
  const from = Math.max(1, Math.floor(BAND_LOW_HZ / binHz));
  const to = Math.min(frequencyDb.length - 1, Math.ceil(BAND_HIGH_HZ / binHz));
  for (let i = from; i <= to; i++) {
    const magnitude = Math.pow(10, frequencyDb[i] / 20);
    weighted += magnitude * i * binHz;
    total += magnitude;
  }
  const centroid = total > 0 ? weighted / total : 1050;
  return { open, wide: clamp((centroid - 1050) / 600, -1, 1) * 0.8 };
}

// ---- 文章の母音から作る口の動き ------------------------------------------------

export type Vowel = "a" | "i" | "u" | "e" | "o" | "n" | "pause";
export type Mora = { vowel: Vowel; ms: number };

/** 1拍の長さ(1秒に約8拍。日本語の読み上げの標準的な速さ) */
export const MORA_MS = 125;

export const VOWEL_SHAPES: Record<Vowel, MouthShape> = {
  a: { open: 0.9, wide: 0.1 },
  i: { open: 0.3, wide: 0.75 },
  u: { open: 0.3, wide: -0.75 },
  e: { open: 0.55, wide: 0.5 },
  o: { open: 0.65, wide: -0.55 },
  n: { open: 0.08, wide: 0 },
  pause: { open: 0, wide: 0 },
};

const KANA_ROWS: Record<"a" | "i" | "u" | "e" | "o", string> = {
  a: "あかがさざただなはばぱまやらわ",
  i: "いきぎしじちぢにひびぴみりゐ",
  u: "うくぐすずつづぬふぶぷむゆるゔ",
  e: "えけげせぜてでねへべぺめれゑ",
  o: "おこごそぞとどのほぼぽもよろを",
};
const SMALL_KANA: Record<string, "a" | "i" | "u" | "e" | "o"> = {
  ぁ: "a", ゃ: "a", ゎ: "a", ぃ: "i", ぅ: "u", ゅ: "u", ぇ: "e", ぉ: "o", ょ: "o",
};
const KANA_VOWEL = new Map<string, Vowel>();
for (const [vowel, chars] of Object.entries(KANA_ROWS)) {
  for (const char of chars) KANA_VOWEL.set(char, vowel as Vowel);
}
const VOWELS: Vowel[] = ["a", "i", "u", "e", "o"];
const SHORT_PAUSE = "、,，・";
const LONG_PAUSE = "。．.！？!?…\n";

/** 文章を拍の並びにする。漢字は読みが分からないため、1字を2拍とみなして母音を仮に決める */
export function textToMorae(text: string): Mora[] {
  const morae: Mora[] = [];
  for (const raw of text) {
    const char = toHiragana(raw);
    const last = morae[morae.length - 1];
    if (KANA_VOWEL.has(char)) {
      morae.push({ vowel: KANA_VOWEL.get(char)!, ms: MORA_MS });
    } else if (char in SMALL_KANA) {
      if (last && last.vowel !== "pause") last.vowel = SMALL_KANA[char];
      else morae.push({ vowel: SMALL_KANA[char], ms: MORA_MS });
    } else if (char === "ん") {
      morae.push({ vowel: "n", ms: MORA_MS });
    } else if (char === "っ") {
      morae.push({ vowel: "pause", ms: MORA_MS * 0.7 });
    } else if (char === "ー" || char === "〜") {
      if (last) last.ms += MORA_MS;
    } else if (SHORT_PAUSE.includes(char)) {
      morae.push({ vowel: "pause", ms: 220 });
    } else if (LONG_PAUSE.includes(char)) {
      morae.push({ vowel: "pause", ms: 380 });
    } else if (/[\p{Script=Han}々]/u.test(char)) {
      const code = char.codePointAt(0)!;
      morae.push({ vowel: VOWELS[code % 5], ms: MORA_MS }, { vowel: VOWELS[(code >> 3) % 5], ms: MORA_MS });
    } else if (/[0-9０-９]/.test(char)) {
      morae.push({ vowel: "i", ms: MORA_MS }, { vowel: "u", ms: MORA_MS });
    } else if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(char)) {
      morae.push({ vowel: VOWELS[char.codePointAt(0)! % 5], ms: MORA_MS });
    }
    // 空白・かっこなどは発音しない
  }
  return morae;
}

/**
 * 話し始めてからの経過時間に対応する口の形。
 * 実際の読み上げの速さは声によって違うため、拍の並びの最後まで来たら先頭に戻して動かし続ける。
 */
export function mouthAt(morae: Mora[], elapsedMs: number): MouthShape {
  const total = morae.reduce((sum, mora) => sum + mora.ms, 0);
  if (total === 0 || elapsedMs < 0) return CLOSED_MOUTH;
  let t = elapsedMs % total;
  for (const mora of morae) {
    if (t < mora.ms) {
      const shape = VOWEL_SHAPES[mora.vowel];
      // 拍の頭(子音)では少し閉じ、母音で開く
      const envelope = 0.45 + 0.55 * Math.sin(Math.PI * (t / mora.ms));
      const vowel = mora.vowel === "n" || mora.vowel === "pause" ? undefined : mora.vowel;
      return { open: shape.open * envelope, wide: shape.wide, vowel };
    }
    t -= mora.ms;
  }
  return CLOSED_MOUTH;
}

function toHiragana(char: string): string {
  const code = char.codePointAt(0)!;
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
}

// ---- 毎フレームの更新 ---------------------------------------------------------

const OPEN_ATTACK_MS = 35;
const OPEN_RELEASE_MS = 60;
const WIDE_MS = 90;

/** 声の状態から、なめらかに変化する口の形を作る */
export class LipSync {
  private shape: MouthShape = CLOSED_MOUTH;
  private time: Float32Array<ArrayBuffer> | null = null;
  private frequency: Float32Array<ArrayBuffer> | null = null;
  private morae: { text: string; list: Mora[] } | null = null;

  update(voice: VoiceState, now: number, dtMs: number): MouthShape {
    const target = this.target(voice, now);
    const openTau = target.open > this.shape.open ? OPEN_ATTACK_MS : OPEN_RELEASE_MS;
    this.shape = {
      open: approach(this.shape.open, target.open, dtMs, openTau),
      wide: approach(this.shape.wide, target.wide, dtMs, WIDE_MS),
      vowel: target.vowel,
    };
    return this.shape;
  }

  private target(voice: VoiceState, now: number): MouthShape {
    if (voice.kind === "audio") {
      const { analyser } = voice;
      if (this.time?.length !== analyser.fftSize) this.time = new Float32Array(analyser.fftSize);
      if (this.frequency?.length !== analyser.frequencyBinCount) this.frequency = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(this.time);
      analyser.getFloatFrequencyData(this.frequency);
      return analyzeFrame(this.time, this.frequency, analyser.context.sampleRate);
    }
    if (voice.kind === "speech") {
      if (this.morae?.text !== voice.text) this.morae = { text: voice.text, list: textToMorae(voice.text) };
      return mouthAt(this.morae.list, now - voice.startedAt);
    }
    return CLOSED_MOUTH;
  }
}

/** 時定数 tauMs で目標値に近づける(フレームの間隔が変わっても同じ速さになる) */
export function approach(current: number, target: number, dtMs: number, tauMs: number): number {
  return target + (current - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
