import { approach, clamp, VOWEL_SHAPES, type MouthShape } from "./lip-sync";
import type { MouthImageKey } from "./manifest";

/**
 * 口の形の画像(「あ・い・う・え・お」)を、声に合わせてどれだけ重ねるかを決める(設計書 3.12)。
 * 文章から作る口の動きは母音が分かるので、その画像を使う。音から作る場合は、口の開きと形が最も近い画像を使う。
 * 口の開きが小さいときは画像を薄く重ね、画像を切り替えるときは短く重ね合わせて、ちらつきを抑える。
 */

export type MouthImageWeight = { key: MouthImageKey; weight: number };

/** 口の開きがこれより小さければ、口を閉じた元画像のままにする */
const CLOSED_BELOW = 0.08;
const FADE_IN_MS = 30;
const FADE_OUT_MS = 45;
/** 口の形(横幅)の推定は音の大きさより不確かなため、距離の計算では軽く扱う */
const WIDE_WEIGHT = 0.5;

export class MouthImageMixer {
  private weights = new Map<MouthImageKey, number>();

  constructor(private readonly available: readonly MouthImageKey[]) {
    for (const key of available) this.weights.set(key, 0);
  }

  get enabled(): boolean {
    return this.available.length > 0;
  }

  /** 重ねる画像と重み(重い順に最大2つ。合計は1以下) */
  update(mouth: MouthShape, dtMs: number): MouthImageWeight[] {
    const target = this.pick(mouth);
    for (const [key, current] of this.weights) {
      const goal = key === target?.key ? target.weight : 0;
      this.weights.set(key, approach(current, goal, dtMs, goal > current ? FADE_IN_MS : FADE_OUT_MS));
    }
    const top = [...this.weights]
      .map(([key, weight]) => ({ key, weight }))
      .filter((w) => w.weight > 0.01)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 2);
    const total = top.reduce((sum, w) => sum + w.weight, 0);
    return total > 1 ? top.map((w) => ({ ...w, weight: w.weight / total })) : top;
  }

  /** 目標とする画像と重み */
  pick(mouth: MouthShape): MouthImageWeight | null {
    if (this.available.length === 0 || mouth.open < CLOSED_BELOW) return null;
    const key = mouth.vowel && this.available.includes(mouth.vowel) ? mouth.vowel : this.nearest(mouth);
    return { key, weight: clamp(mouth.open / (VOWEL_SHAPES[key].open * 0.85), 0, 1) };
  }

  private nearest(mouth: MouthShape): MouthImageKey {
    let best = this.available[0];
    let bestDistance = Infinity;
    for (const key of this.available) {
      const shape = VOWEL_SHAPES[key];
      const d = Math.hypot(shape.open - mouth.open, (shape.wide - mouth.wide) * WIDE_WEIGHT);
      if (d < bestDistance) {
        best = key;
        bestDistance = d;
      }
    }
    return best;
  }
}
