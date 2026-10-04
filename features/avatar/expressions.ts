import { ALIGN_MIN_SCORE, alignSimilarity, type GrayImage, type Similarity } from "./align";
import {
  alignmentAreas,
  expressionRegions,
  type AvatarManifest,
  type ExpressionImage,
  type ExpressionRegion,
  type MouthImageKey,
} from "./manifest";

/**
 * 表情違いの画像を、元画像に重ねられる形に整える(ブラウザで実行する。設計書 3.12)。
 * 1. 位置合わせ(align.ts) 2. 重ねる範囲の切り出し 3. 明るさ・色味を元画像に合わせる。
 * 切り出した部分だけを保存するため、ブラウザに保存する量が小さくて済む。
 */

export type ExpressionKind = MouthImageKey | "blink";

export class ExpressionImageError extends Error {}

/** 位置合わせに使う画像の幅(粗い順)。元画像の幅を超える段階は使わない */
const LEVEL_WIDTHS = [64, 128, 256, 512, 1024];
/** 色味の補正の上限(元画像と大きく違う場合に、無理に合わせない) */
const MAX_GAIN = 1.15;

export async function prepareExpression(manifest: AvatarManifest, kind: ExpressionKind, file: Blob): Promise<ExpressionImage> {
  const area = kind === "blink" ? "eyes" : "mouth";
  const [base, variant] = await Promise.all([loadCanvas(manifest.src, manifest.width), loadCanvas(file, manifest.width)]);
  // 画面の表示を止めないよう、重い計算の前に一度処理を返す
  await new Promise((resolve) => setTimeout(resolve, 0));

  const widths = LEVEL_WIDTHS.filter((w) => w < manifest.width).concat(Math.min(manifest.width, 1024));
  const result = alignSimilarity(grayPyramid(base, widths, manifest.width), grayPyramid(variant, widths, manifest.width), alignmentAreas(manifest, area), manifest.width);
  if (result.score < ALIGN_MIN_SCORE) {
    throw new ExpressionImageError("元の画像と位置を合わせられませんでした。同じ人物・同じ構図のまま表情だけを変えた画像を使ってください");
  }
  const region = expressionRegions(manifest)[area];
  const patch = extractPatch(variant, result.transform, region);
  matchColors(patch, base, region);
  return { src: patch.toDataURL("image/jpeg", 0.92), rect: region.rect };
}

/** 画像を、幅が元画像と同じになるよう拡大縮小してキャンバスに描く(座標を元画像のピクセルにそろえる) */
async function loadCanvas(source: string | Blob, width: number): Promise<HTMLCanvasElement> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = document.createElement("img");
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((img.naturalHeight * width) / img.naturalWidth);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new ExpressionImageError("画像を読み込めませんでした");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

/** 位置合わせ用の輝度画像(細かい段階から半分ずつ縮小して作り、粗い順に並べる) */
function grayPyramid(source: HTMLCanvasElement, widths: number[], baseWidth: number): GrayImage[] {
  const levels: GrayImage[] = [];
  let current: HTMLCanvasElement = source;
  for (const width of [...widths].sort((a, b) => b - a)) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.max(1, Math.round((source.height * width) / source.width));
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Float32Array(canvas.width * canvas.height);
    for (let i = 0; i < gray.length; i++) gray[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    levels.unshift({ width: canvas.width, height: canvas.height, data: gray, scale: width / baseWidth });
    current = canvas;
  }
  return levels;
}

/** 表情の画像から、元画像の region.rect にあたる部分を、位置を合わせて切り出す */
function extractPatch(variant: HTMLCanvasElement, t: Similarity, region: ExpressionRegion): HTMLCanvasElement {
  const { rect } = region;
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.imageSmoothingQuality = "high";
  // 表情の画像の点 v を、元画像の点 p = c + R(-angle)·(v − c − t) / scale に描く
  ctx.translate(t.cx - rect.x, t.cy - rect.y);
  ctx.rotate(-t.angle);
  ctx.scale(1 / t.scale, 1 / t.scale);
  ctx.translate(-(t.cx + t.tx), -(t.cy + t.ty));
  ctx.drawImage(variant, 0, 0);
  return canvas;
}

/** 重ねる範囲の縁(元画像へ戻っていく部分)で、明るさ・色味が元画像とそろうように補正する */
function matchColors(patch: HTMLCanvasElement, base: HTMLCanvasElement, region: ExpressionRegion) {
  const { rect, ellipses } = region;
  const patchCtx = patch.getContext("2d", { willReadFrequently: true })!;
  const patchData = patchCtx.getImageData(0, 0, rect.width, rect.height);
  const baseData = base.getContext("2d", { willReadFrequently: true })!.getImageData(rect.x, rect.y, rect.width, rect.height).data;
  const sumBase = [0, 0, 0];
  const sumPatch = [0, 0, 0];
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const d = Math.min(...ellipses.map((e) => Math.hypot((rect.x + x + 0.5 - e.cx) / e.rx, (rect.y + y + 0.5 - e.cy) / e.ry)));
      if (d < 0.6 || d > 1) continue;
      const i = (y * rect.width + x) * 4;
      for (let c = 0; c < 3; c++) {
        sumBase[c] += baseData[i + c];
        sumPatch[c] += patchData.data[i + c];
      }
    }
  }
  const gains = sumBase.map((b, c) => Math.min(MAX_GAIN, Math.max(1 / MAX_GAIN, sumPatch[c] > 0 ? b / sumPatch[c] : 1)));
  const data = patchData.data;
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) data[i + c] = Math.min(255, data[i + c] * gains[c]);
  }
  patchCtx.putImageData(patchData, 0, 0);
}
