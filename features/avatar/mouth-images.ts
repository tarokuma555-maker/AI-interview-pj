import { clamp, VOWEL_SHAPES, type MouthShape } from "./lip-sync";
import type { MouthImageKey } from "./manifest";

/**
 * 口の形の画像(「あ・い・う・え・お」)を、声に合わせてどれだけ重ねるかを決める(設計書 3.12)。
 * 文章から作る口の動きは母音が分かるので、その画像を使う。音から作る場合は、口の開きと形が最も近い画像を使う。
 * なめらかに見せるため、次の3つを行う(試作で、1フレームあたりの最大の変化が約半分になった)。
 * - 重みは臨界減衰のばねで動かし、重ね始めと重ね終わりをなめらかにする
 * - 口の形を切り替えたら一定時間は次の形に切り替えず、短い間に何度も切り替えない
 * - 重ね合わせの途中でも口が開いて見えるよう、元画像の口も同じくらい開く(blendShape)
 */

export type MouthImageWeight = { key: MouthImageKey; weight: number };

/** 口の開きがこれより小さければ、口を閉じた元画像のままにする */
const CLOSED_BELOW = 0.08;
/** 口の形(横幅)の推定は音の大きさより不確かなため、距離の計算では軽く扱う */
const WIDE_WEIGHT = 0.5;
/** 画像を重ねる・外すときに、落ち着くまでのおおよその時間の目安 */
const FADE_IN_MS = 60;
const FADE_OUT_MS = 90;
/** 口の形を切り替えたら、少なくともこの時間は次の形に切り替えない(口がほぼ閉じているときを除く) */
const HOLD_MS = 140;

export class MouthImageMixer {
  private weights = new Map<MouthImageKey, number>();
  private velocities = new Map<MouthImageKey, number>();
  private current: MouthImageKey | null = null;
  private elapsed = 0;
  private switchedAt = -Infinity;

  constructor(private readonly available: readonly MouthImageKey[]) {
    for (const key of available) this.weights.set(key, 0);
  }

  get enabled(): boolean {
    return this.available.length > 0;
  }

  /** 重ねる画像と重み(重い順に最大2つ。合計は1以下) */
  update(mouth: MouthShape, dtMs: number): MouthImageWeight[] {
    this.elapsed += Math.max(0, dtMs);
    let target = this.pick(mouth);
    const holding = this.current !== null && this.elapsed - this.switchedAt < HOLD_MS && (this.weights.get(this.current) ?? 0) > 0.2;
    if (target && this.current && target.key !== this.current && holding) target = this.weighted(this.current, mouth);
    if (target && target.key !== this.current) {
      this.current = target.key;
      this.switchedAt = this.elapsed;
    }
    for (const [key, current] of this.weights) {
      const goal = key === target?.key ? target.weight : 0;
      const [weight, velocity] = spring(current, this.velocities.get(key) ?? 0, goal, dtMs, goal > current ? FADE_IN_MS : FADE_OUT_MS);
      this.weights.set(key, clamp(weight, 0, 1));
      this.velocities.set(key, velocity);
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
    return this.weighted(key, mouth);
  }

  /** いま重ねている画像から見た口の開きと形。元画像の口もこれに合わせて開くと、重ね合わせの途中も自然に見える */
  blendShape(): MouthShape {
    let open = 0;
    let wide = 0;
    let total = 0;
    for (const [key, weight] of this.weights) {
      open += weight * VOWEL_SHAPES[key].open;
      wide += weight * VOWEL_SHAPES[key].wide;
      total += weight;
    }
    return { open, wide: total > 0 ? wide / total : 0 };
  }

  /** 口の開き(その形の開きに対する割合)に応じた重み。少し開いただけでも形が分かるよう、なめらかに立ち上げる */
  private weighted(key: MouthImageKey, mouth: MouthShape): MouthImageWeight {
    const ratio = clamp(mouth.open / (VOWEL_SHAPES[key].open * 0.85), 0, 1);
    return { key, weight: ratio * ratio * (3 - 2 * ratio) };
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

/** 臨界減衰のばねで目標値に近づける(動き始めと止まり際がなめらか)。tau は指数関数で近づける場合とほぼ同じ時間で落ち着く値 */
function spring(value: number, velocity: number, goal: number, dtMs: number, tauMs: number): [number, number] {
  const omega = 1.65 / tauMs;
  const x = value - goal;
  const decay = Math.exp(-omega * dtMs);
  const temp = (velocity + omega * x) * dtMs;
  return [goal + (x + temp) * decay, (velocity - omega * temp) * decay];
}
