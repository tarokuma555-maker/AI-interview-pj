import { z } from "zod";
import { approach, clamp, type MouthShape } from "./lip-sync";
import { rectSchema } from "./manifest";

/**
 * 話している動画から切り出した口元のコマ(設計書 3.12)。
 * 動画の各コマを元画像に位置合わせして口元だけを切り出し(scripts/build-mouth-frames.mjs)、
 * 1枚の画像に並べておく。声に合わせてコマを選び、隣り合うコマを重ねながら再生すると、
 * 口・あご・頬が本物の動画のように動く。話し終えて少したつと、元画像の口(閉じた口)へなめらかに戻す。
 */

const frameSchema = z.object({
  /** 口の開き(0〜1。この動画の中での順位で、最も閉じたコマが0、最も開いたコマが1) */
  open: z.number().min(0).max(1),
  /** 口の形(-1 すぼめる 〜 +1 横に広げる) */
  wide: z.number().min(-1).max(1),
  /** 元画像と比べたあご先の下がり(元画像のピクセル) */
  jaw: z.number(),
  /** 動画でこの前のコマを使っていない(続けて再生できない) */
  cut: z.boolean().optional(),
});

export const mouthFramesSchema = z.object({
  version: z.literal(1),
  /** コマを並べた画像の URL */
  image: z.string(),
  /** 元画像に重ねる位置(1コマの大きさ) */
  rect: rectSchema,
  /** 画像の1行に並べたコマの数 */
  columns: z.number().int().positive(),
  /** 動画のコマの速さ(1秒あたり) */
  fps: z.number().positive(),
  frames: z.array(frameSchema).min(2),
  /** 各コマの口元を縮小した輝度(featureSize 個ずつ、0〜255)を base64 にしたもの。似たコマを探すのに使う */
  features: z.string(),
  featureSize: z.number().int().positive(),
});

export type MouthFrames = z.infer<typeof mouthFramesSchema>;
export type MouthFrameInfo = MouthFrames["frames"][number];

/**
 * 描くコマ:from から to へ、mix の割合で重ねる。jaw は重ねた結果のあごの下がり。
 * weight はコマを元画像に重ねる濃さ(0 なら元画像の口のまま)
 */
export type MouthFrameBlend = { from: number; to: number; mix: number; jaw: number; weight: number };

/** コマどうしの見た目の違い(0 が同じ。コマの組み合わせの中央値を1とする) */
export function frameDistances(features: Uint8Array, size: number, count: number): Float32Array {
  const distances = new Float32Array(count * count);
  for (let a = 0; a < count; a++) {
    for (let b = a + 1; b < count; b++) {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += Math.abs(features[a * size + i] - features[b * size + i]);
      distances[a * count + b] = distances[b * count + a] = sum / size;
    }
  }
  const offDiagonal = distances.filter((_, i) => i % count !== Math.floor(i / count)).sort();
  const median = offDiagonal[Math.floor(offDiagonal.length / 2)] || 1;
  for (let i = 0; i < distances.length; i++) distances[i] /= median;
  return distances;
}

export function decodeFeatures(data: MouthFrames): Uint8Array {
  const binary = atob(data.features);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length !== data.featureSize * data.frames.length) throw new Error("口元のコマの情報が壊れています");
  return bytes;
}

/** コマの情報から、再生の準備をする */
export function createMouthFramePlayer(data: MouthFrames): MouthFramePlayer {
  const distances = frameDistances(decodeFeatures(data), data.featureSize, data.frames.length);
  return new MouthFramePlayer(data.frames, data.fps, distances);
}

/** 再生の調整(試作で、追従のよさと動きの自然さの釣り合いを見て決めた) */
export type PlayerTuning = {
  /** 口の開きと形が目標から離れていることの重み(声が途切れたときは rest。口を閉じるのは特に大事) */
  match: number;
  rest: number;
  /** 1コマ飛ばす・同じコマで止まる・1コマ戻るときの負担(動画の順番どおりに進めるときは0)。
   * 話している間に止まり続けると不自然なため、続けて止まるほど負担を大きくする(holdGrowth 倍ずつ) */
  skip: number;
  hold: number;
  holdGrowth: number;
  reverse: number;
  /** 動画の順番から離れたコマへ移るときの負担と、見た目の違いの重み */
  jump: number;
  look: number;
  /** 離れたコマへ移るときに重ね合わせる長さ(コマ数) */
  jumpSteps: number;
};

export const DEFAULT_TUNING: PlayerTuning = { match: 1, rest: 3, skip: 0.05, hold: 0.05, holdGrowth: 2, reverse: 0.2, jump: 0.25, look: 0.25, jumpSteps: 2 };

/** 口の形(横幅)の推定は不確かなため、開きより軽く扱う */
const WIDE_WEIGHT = 0.3;
/** これより口の開きが小さければ、閉じたコマで止まっていてよい */
const RESTING_BELOW = 0.04;
/** 声が途切れてこの時間がたったら、元画像の口へ戻す(読点などの短い間では戻さない) */
const RETURN_AFTER_MS = 300;
/** コマを重ね始める・元画像へ戻すときの時定数 */
const SHOW_MS = 40;
const RETURN_MS = 120;

/**
 * 声に合わせて、動画のコマを選びながら再生する。
 * 動画のコマの速さで1コマずつ進め、次のコマを「目標の口の形に近いか」と「動画の順番どおりか」で選ぶ。
 * 順番どおり(または1コマ飛ばす・止まる・戻る)なら本物の動画の動きに近く、
 * 目標から大きく離れたときだけ、今のコマと似ていて目標に近いコマへ、少し長めに重ね合わせながら移る。
 * 前のコマから次のコマへは重ね合わせで少しずつ移すため、画面の更新が動画より速くてもなめらかに見える。
 */
export class MouthFramePlayer {
  private from: number;
  private to: number;
  private phase = 0;
  /** 今の移り変わりにかけるコマ数 */
  private steps = 1;
  /** 話している間に、同じコマで続けて止まった回数 */
  private holds = 0;
  /** 声が途切れてからの時間と、コマを重ねる濃さ(声が出るまでは元画像の口のまま) */
  private restingMs = RETURN_AFTER_MS;
  private weight = 0;
  private readonly stepMs: number;

  constructor(
    private readonly frames: readonly MouthFrameInfo[],
    fps: number,
    private readonly distances: Float32Array,
    private readonly tuning: PlayerTuning = DEFAULT_TUNING,
  ) {
    this.stepMs = 1000 / fps;
    this.from = this.to = this.closest({ open: 0, wide: 0 });
  }

  update(mouth: MouthShape, dtMs: number): MouthFrameBlend {
    this.restingMs = mouth.open < RESTING_BELOW ? this.restingMs + Math.max(0, dtMs) : 0;
    const shown = this.restingMs < RETURN_AFTER_MS ? 1 : 0;
    this.weight = approach(this.weight, shown, dtMs, shown > this.weight ? SHOW_MS : RETURN_MS);
    this.phase += Math.max(0, dtMs) / (this.stepMs * this.steps);
    // 画面の更新が大きく遅れたときは、途中のコマを飛ばす
    if (this.phase >= 3) this.phase = 1 + (this.phase % 1);
    while (this.phase >= 1) {
      const previousSteps = this.steps;
      this.from = this.to;
      const next = this.next(this.from, mouth);
      this.holds = next.frame === this.from && mouth.open >= RESTING_BELOW ? this.holds + 1 : 0;
      this.to = next.frame;
      this.steps = next.steps;
      this.phase = ((this.phase - 1) * previousSteps) / this.steps;
    }
    const mix = this.from === this.to ? 0 : this.phase;
    const jaw = this.frames[this.from].jaw * (1 - mix) + this.frames[this.to].jaw * mix;
    return { from: this.from, to: this.to, mix, jaw, weight: this.weight < 0.002 ? 0 : this.weight };
  }

  /** 次に移るコマと、移り変わりにかけるコマ数 */
  next(current: number, mouth: MouthShape): { frame: number; steps: number } {
    const count = this.frames.length;
    const t = this.tuning;
    const continues = (i: number) => i > 0 && i < count && !this.frames[i].cut;
    const following = continues(current + 1) ? current + 1 : -1;
    const skipping = following >= 0 && continues(current + 2) ? current + 2 : -1;
    const previous = continues(current) ? current - 1 : -1;
    const resting = mouth.open < RESTING_BELOW;
    let best = { frame: current, steps: 1 };
    let bestCost = Infinity;
    for (let j = 0; j < count; j++) {
      let cost = (resting ? t.rest : t.match) * this.mismatch(j, mouth);
      let steps = 1;
      if (j === following) cost += 0;
      else if (j === skipping) cost += t.skip;
      else if (j === current) cost += resting ? 0 : t.hold * Math.pow(t.holdGrowth, this.holds);
      else if (j === previous) cost += t.reverse;
      else {
        cost += t.jump + t.look * this.distances[current * count + j];
        steps = t.jumpSteps;
      }
      if (cost < bestCost) {
        best = { frame: j, steps };
        bestCost = cost;
      }
    }
    return best;
  }

  private mismatch(index: number, mouth: MouthShape): number {
    const frame = this.frames[index];
    return Math.abs(frame.open - clamp(mouth.open, 0, 1)) + WIDE_WEIGHT * Math.abs(frame.wide - mouth.wide);
  }

  private closest(mouth: MouthShape): number {
    let best = 0;
    for (let j = 1; j < this.frames.length; j++) if (this.mismatch(j, mouth) < this.mismatch(best, mouth)) best = j;
    return best;
  }
}
