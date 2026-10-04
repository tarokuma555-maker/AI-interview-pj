import type { Point, Rect } from "./manifest";

/**
 * 表情違いの画像を、元画像に位置合わせする(設計書 3.12)。
 * 画像生成AIで作り直した画像は、顔の位置・大きさ・傾きがわずかにずれることがあるため、
 * 表情によって変わらない部分(目・鼻など)が最もよく重なる相似変換(移動・拡大縮小・回転)を探す。
 * 粗い画像で広く探し、細かい画像で絞り込む。重なり具合は正規化相互相関(明るさの違いに強い)で測る。
 */

/** 輝度(0〜1)の画像。scale は元画像の1ピクセルに対する、この画像のピクセル数 */
export type GrayImage = { width: number; height: number; data: Float32Array; scale: number };

/** 元画像の点 p を、表情の画像の点 v に移す:v = c + s·R(angle)·(p − c) + t */
export type Similarity = { scale: number; angle: number; tx: number; ty: number; cx: number; cy: number };

export type AlignResult = { transform: Similarity; score: number };

/** 重なり具合がこれより低い場合は、同じ構図の画像ではないとみなす */
export const ALIGN_MIN_SCORE = 0.8;

/** 1段階あたりに使う点の数の上限(計算時間を抑える) */
const MAX_POINTS = 4000;

export function applySimilarity(t: Similarity, p: Point): Point {
  const dx = p.x - t.cx;
  const dy = p.y - t.cy;
  const cos = Math.cos(t.angle) * t.scale;
  const sin = Math.sin(t.angle) * t.scale;
  return { x: t.cx + cos * dx - sin * dy + t.tx, y: t.cy + sin * dx + cos * dy + t.ty };
}

/**
 * base と variant は同じ大きさの段階(粗い順)の画像の並び。座標はどちらも元画像のピクセル単位で扱う。
 * areas は位置合わせに使う範囲(元画像の座標)。
 * 最も粗い段階では広い範囲をすべて調べる。以降の段階では、最良の値から1刻みずつ動かして良くなる方へ進む
 * (粗い段階の選択が少しずれていても、細かい段階で取り戻せる)。
 */
export function alignSimilarity(base: GrayImage[], variant: GrayImage[], areas: Rect[], imageWidth: number): AlignResult {
  const center = areasCenter(areas);
  let best: AlignResult = { transform: { scale: 1, angle: 0, tx: 0, ty: 0, cx: center.x, cy: center.y }, score: -Infinity };
  let scaleStep = 0.025;
  let angleStep = (2 * Math.PI) / 180;

  for (let level = 0; level < base.length; level++) {
    const points = samplePoints(base[level], areas);
    const shiftStep = 1 / base[level].scale;
    if (level === 0) {
      const shiftRange = Math.ceil((imageWidth * 0.08) / shiftStep);
      best = searchGrid(points, variant[level], best.transform, { shift: [shiftStep, shiftRange], scale: [scaleStep, 4], angle: [angleStep, 2] });
    } else {
      // 最良の値の点数を、この段階の画像で測り直してから進める
      best = { transform: best.transform, score: correlation(points, variant[level], best.transform) };
      for (const factor of [1, 0.5]) {
        best = climb(points, variant[level], best, { shift: shiftStep * factor, scale: scaleStep * factor, angle: angleStep * factor });
      }
    }
    scaleStep /= 2;
    angleStep /= 2;
  }
  return best;
}

type Steps = { shift: number; scale: number; angle: number };

/** 刻み × 範囲のすべての組み合わせを調べる */
function searchGrid(
  points: Points,
  variant: GrayImage,
  origin: Similarity,
  grid: { shift: [number, number]; scale: [number, number]; angle: [number, number] },
): AlignResult {
  let best: AlignResult = { transform: origin, score: -Infinity };
  const [shiftStep, shiftRange] = grid.shift;
  const [scaleStep, scaleRange] = grid.scale;
  const [angleStep, angleRange] = grid.angle;
  for (let si = -scaleRange; si <= scaleRange; si++) {
    for (let ai = -angleRange; ai <= angleRange; ai++) {
      for (let yi = -shiftRange; yi <= shiftRange; yi++) {
        for (let xi = -shiftRange; xi <= shiftRange; xi++) {
          const candidate = move(origin, { shift: shiftStep, scale: scaleStep, angle: angleStep }, xi, yi, si, ai);
          const score = correlation(points, variant, candidate);
          if (score > best.score) best = { transform: candidate, score };
        }
      }
    }
  }
  return best;
}

/** 4つの値をそれぞれ ±1刻み動かした組み合わせのうち最良のものへ進み、良くならなくなったら止める */
function climb(points: Points, variant: GrayImage, start: AlignResult, steps: Steps): AlignResult {
  let best = start;
  for (let iteration = 0; iteration < 20; iteration++) {
    let next = best;
    for (let si = -1; si <= 1; si++) {
      for (let ai = -1; ai <= 1; ai++) {
        for (let yi = -1; yi <= 1; yi++) {
          for (let xi = -1; xi <= 1; xi++) {
            if (!si && !ai && !yi && !xi) continue;
            const candidate = move(best.transform, steps, xi, yi, si, ai);
            const score = correlation(points, variant, candidate);
            if (score > next.score) next = { transform: candidate, score };
          }
        }
      }
    }
    if (next === best) break;
    best = next;
  }
  return best;
}

function move(origin: Similarity, steps: Steps, xi: number, yi: number, si: number, ai: number): Similarity {
  return {
    ...origin,
    scale: origin.scale + si * steps.scale,
    angle: origin.angle + ai * steps.angle,
    tx: origin.tx + xi * steps.shift,
    ty: origin.ty + yi * steps.shift,
  };
}

type Points = { xs: Float32Array; ys: Float32Array; values: Float32Array };

/** 位置合わせに使う点(この段階の画像の1ピクセルごと。多すぎる場合は間引く)と、元画像の輝度 */
function samplePoints(image: GrayImage, areas: Rect[]): Points {
  const step = 1 / image.scale;
  const total = areas.reduce((sum, a) => sum + (a.width / step) * (a.height / step), 0);
  const stride = Math.max(1, Math.sqrt(total / MAX_POINTS));
  const xs: number[] = [];
  const ys: number[] = [];
  const values: number[] = [];
  for (const area of areas) {
    for (let y = area.y + step / 2; y < area.y + area.height; y += step * stride) {
      for (let x = area.x + step / 2; x < area.x + area.width; x += step * stride) {
        const value = sample(image, x, y);
        if (value === null) continue;
        xs.push(x);
        ys.push(y);
        values.push(value);
      }
    }
  }
  return { xs: Float32Array.from(xs), ys: Float32Array.from(ys), values: Float32Array.from(values) };
}

/** 正規化相互相関(-1〜1)。表情の画像の外にはみ出す点が多い場合は、対応が取れないとみなす */
function correlation(points: Points, variant: GrayImage, t: Similarity): number {
  const cos = Math.cos(t.angle) * t.scale;
  const sin = Math.sin(t.angle) * t.scale;
  let n = 0;
  let sumV = 0;
  let sumVV = 0;
  let sumBV = 0;
  let sumB = 0;
  let sumBB = 0;
  for (let i = 0; i < points.values.length; i++) {
    const dx = points.xs[i] - t.cx;
    const dy = points.ys[i] - t.cy;
    const v = sample(variant, t.cx + cos * dx - sin * dy + t.tx, t.cy + sin * dx + cos * dy + t.ty);
    if (v === null) continue;
    const b = points.values[i];
    n++;
    sumV += v;
    sumVV += v * v;
    sumB += b;
    sumBB += b * b;
    sumBV += b * v;
  }
  if (n < points.values.length * 0.8 || n < 16) return -1;
  const covariance = sumBV - (sumB * sumV) / n;
  const varianceB = sumBB - (sumB * sumB) / n;
  const varianceV = sumVV - (sumV * sumV) / n;
  if (varianceB <= 1e-9 || varianceV <= 1e-9) return -1;
  return covariance / Math.sqrt(varianceB * varianceV);
}

/** 元画像の座標 (x, y) の輝度を、この段階の画像から双線形補間で読む。画像の外なら null */
export function sample(image: GrayImage, x: number, y: number): number | null {
  const u = x * image.scale - 0.5;
  const v = y * image.scale - 0.5;
  if (u < 0 || v < 0 || u > image.width - 1 || v > image.height - 1) return null;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const fx = u - x0;
  const fy = v - y0;
  const d = image.data;
  const w = image.width;
  const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
  const bottom = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function areasCenter(areas: Rect[]): Point {
  const x0 = Math.min(...areas.map((a) => a.x));
  const y0 = Math.min(...areas.map((a) => a.y));
  const x1 = Math.max(...areas.map((a) => a.x + a.width));
  const y1 = Math.max(...areas.map((a) => a.y + a.height));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
