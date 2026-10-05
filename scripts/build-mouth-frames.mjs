// 話している動画から、口元のコマを作る(設計書 3.12)。
// 動画の各コマを標準の面接官の写真に位置合わせし(features/avatar/align.ts)、口元だけを切り出して1枚の画像に並べる。
// あわせて、各コマの口の開き・形・あごの下がりと、似たコマを探すための縮小画像を JSON に書き出す。
//
// 使い方: node scripts/build-mouth-frames.mjs <動画ファイル>
// 必要なもの: ffmpeg(コマの取り出し)。sharp と jiti は依存パッケージに含まれている。
// 出力: public/avatars/sato/mouth-frames.webp, public/avatars/sato/mouth-frames.json
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url);
const { ALIGN_MIN_SCORE, alignSimilarity, applySimilarity } = await jiti.import("../features/avatar/align.ts");
const { alignmentAreas, expressionRegions, STANDARD_AVATAR } = await jiti.import("../features/avatar/manifest.ts");

const video = process.argv[2];
if (!video) {
  console.error("使い方: node scripts/build-mouth-frames.mjs <動画ファイル>");
  process.exit(1);
}

const manifest = STANDARD_AVATAR;
const outDir = `${root}public/avatars/${manifest.id}/`;
const imageUrl = `/avatars/${manifest.id}/mouth-frames.webp`;
/** 色味の補正の上限(features/avatar/expressions.ts と同じ) */
const MAX_GAIN = 1.15;
/** 似たコマを探すための縮小画像の大きさ(縦横) */
const FEATURE_GRID = 10;

// ---- 元画像 ----------------------------------------------------------------------

const base = await sharp(`${root}public${manifest.src}`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = base.info.width;
const H = base.info.height;
if (W !== manifest.width || H !== manifest.height) throw new Error("元画像の大きさが設定と違います");
const baseGray = toGray(base.data, W * H);
const levels = [64, 128, 256, 512, 1024].filter((w) => w < W).concat(Math.min(W, 1024));
const basePyramid = pyramid(baseGray, W, H, levels);
const areas = alignmentAreas(manifest, "mouth");
const region = expressionRegions(manifest).mouth;
const rect = region.rect;
const ellipse = region.ellipses[0];

const { center: mouth, left: mouthLeft, right: mouthRight } = manifest.mouth;
const chin = manifest.chin;
const toChin = chin.y - mouth.y;
const mouthHalf = (mouthRight.x - mouthLeft.x) / 2;

// ---- 動画のコマ ------------------------------------------------------------------

const { fps, width: videoWidth, height: videoHeight } = await probe(video);
// 元画像と同じ幅に縮小して取り出す(座標を元画像のピクセルにそろえる)
const FW = W;
const FH = Math.round((videoHeight * W) / videoWidth / 2) * 2;
const kept = [];
let skipped = false;
let count = 0;
await forEachFrame(video, FW, FH, (rgb, index) => {
  count++;
  const gray = toGray(rgb, FW * FH);
  const result = alignSimilarity(basePyramid, pyramid(gray, FW, FH, levels), areas, W);
  if (result.score < ALIGN_MIN_SCORE) {
    console.log(`コマ ${index}: 位置を合わせられないため使わない(${result.score.toFixed(3)})`);
    skipped = true;
    return;
  }
  kept.push({ index, cut: skipped || undefined, patch: extract(rgb, FW, FH, result.transform), score: result.score });
  skipped = false;
});
console.log(`コマ数 ${count}(${fps} コマ/秒、${FW}×${FH} に縮小)`);
if (kept.length < 2) throw new Error("使えるコマがありません。元画像と同じ構図の動画を使ってください");

// ---- 色味:縁(あごより上)の明るさを元画像にそろえる。コマごとに変えるとちらつくため、全コマの中央値を使う ----

const gains = [0, 1, 2].map((c) => median(kept.map((frame) => edgeGain(frame.patch, c))));
for (const frame of kept) {
  for (let i = 0; i < frame.patch.length; i++) frame.patch[i] = Math.min(255, Math.round(frame.patch[i] * gains[i % 3]));
}

// ---- 口の開き・形 ----------------------------------------------------------------

const measured = kept.map((frame) => measure(frame.patch));
const jawRange = percentiles(measured.map((m) => m.jaw));
const darkRange = percentiles(measured.map((m) => m.dark));
const widthRange = percentiles(measured.map((m) => m.width));
const widthMid = median(measured.map((m) => m.width));
const openness = measured.map((m) => 0.5 * normalize(m.jaw, jawRange) + 0.5 * normalize(m.dark, darkRange));
// 開きは、このコマが動画の中で何番目に開いているか(0〜1)で表す
const rank = openness.map((value, i) => [value, i]).sort((a, b) => a[0] - b[0]);
const open = new Array(kept.length);
rank.forEach(([, i], r) => (open[i] = r / (kept.length - 1)));

const frames = kept.map((frame, i) => ({
  open: round(open[i], 3),
  wide: round(clamp((measured[i].width - widthMid) / Math.max(1, (widthRange[1] - widthRange[0]) / 2), -1, 1), 3),
  jaw: round(measured[i].jaw, 1),
  ...(frame.cut ? { cut: true } : {}),
}));

// ---- 1枚の画像に並べる -------------------------------------------------------------

const columns = Math.ceil(Math.sqrt((kept.length * rect.height) / rect.width));
const rows = Math.ceil(kept.length / columns);
const atlas = Buffer.alloc(columns * rect.width * rows * rect.height * 3, 255);
kept.forEach((frame, i) => {
  const ox = (i % columns) * rect.width;
  const oy = Math.floor(i / columns) * rect.height;
  for (let y = 0; y < rect.height; y++) {
    frame.patch.copy(atlas, ((oy + y) * columns * rect.width + ox) * 3, y * rect.width * 3, (y + 1) * rect.width * 3);
  }
});
await sharp(atlas, { raw: { width: columns * rect.width, height: rows * rect.height, channels: 3 } })
  .webp({ quality: 82, effort: 6 })
  .toFile(`${outDir}mouth-frames.webp`);

const features = Buffer.concat(kept.map((frame) => feature(frame.patch)));
const data = {
  version: 1,
  image: imageUrl,
  rect,
  columns,
  fps,
  frames,
  features: features.toString("base64"),
  featureSize: FEATURE_GRID * FEATURE_GRID,
};
writeFileSync(`${outDir}mouth-frames.json`, `${JSON.stringify(data)}\n`);
console.log(
  `書き出し: ${kept.length} コマ(${columns}×${rows})、色味の補正 ${gains.map((g) => g.toFixed(3)).join("/")}、` +
    `位置合わせの重なり具合 最低 ${Math.min(...kept.map((f) => f.score)).toFixed(3)}`,
);

// ---- 計算 --------------------------------------------------------------------------

function toGray(rgb, count) {
  const gray = new Float32Array(count);
  for (let i = 0; i < count; i++) gray[i] = (0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2]) / 255;
  return gray;
}

/** 位置合わせ用の輝度画像(粗い順。features/avatar/expressions.ts の grayPyramid と同じ考え方) */
function pyramid(gray, width, height, widths) {
  return widths.map((target) => {
    const factor = width / target;
    const h = Math.max(1, Math.round(height / factor));
    const data = new Float32Array(target * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < target; x++) {
        let sum = 0;
        let n = 0;
        for (let yy = Math.floor(y * factor); yy < Math.min(height, Math.floor((y + 1) * factor)); yy++) {
          for (let xx = Math.floor(x * factor); xx < Math.min(width, Math.floor((x + 1) * factor)); xx++) {
            sum += gray[yy * width + xx];
            n++;
          }
        }
        data[y * target + x] = n ? sum / n : 0;
      }
    }
    return { width: target, height: h, data, scale: target / W };
  });
}

/** 元画像の rect にあたる部分を、位置を合わせて切り出す(双線形補間) */
function extract(rgb, width, height, transform) {
  const patch = Buffer.alloc(rect.width * rect.height * 3);
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const v = applySimilarity(transform, { x: rect.x + x + 0.5, y: rect.y + y + 0.5 });
      const u = clamp(v.x - 0.5, 0, width - 1.001);
      const w = clamp(v.y - 0.5, 0, height - 1.001);
      const x0 = Math.floor(u);
      const y0 = Math.floor(w);
      const fx = u - x0;
      const fy = w - y0;
      for (let c = 0; c < 3; c++) {
        const at = (xx, yy) => rgb[(yy * width + xx) * 3 + c];
        const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
        const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
        patch[(y * rect.width + x) * 3 + c] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return patch;
}

/** 重ねる範囲の縁(あごより上)で、元画像との明るさの比 */
function edgeGain(patch, channel) {
  let sumBase = 0;
  let sumPatch = 0;
  for (let y = 0; y < rect.height; y++) {
    const py = rect.y + y + 0.5;
    if (py > chin.y) break;
    for (let x = 0; x < rect.width; x++) {
      const d = Math.hypot((rect.x + x + 0.5 - ellipse.cx) / ellipse.rx, (py - ellipse.cy) / ellipse.ry);
      if (d < 0.6 || d > 1) continue;
      sumBase += base.data[((rect.y + y) * W + rect.x + x) * 3 + channel];
      sumPatch += patch[(y * rect.width + x) * 3 + channel];
    }
  }
  return clamp(sumPatch > 0 ? sumBase / sumPatch : 1, 1 / MAX_GAIN, MAX_GAIN);
}

/** 切り出したコマの、元画像の座標 (x, y) の輝度 */
function patchLuma(patch, x, y) {
  const lx = Math.round(x - rect.x - 0.5);
  const ly = Math.round(y - rect.y - 0.5);
  if (lx < 0 || ly < 0 || lx >= rect.width || ly >= rect.height) return null;
  const i = (ly * rect.width + lx) * 3;
  return (0.299 * patch[i] + 0.587 * patch[i + 1] + 0.114 * patch[i + 2]) / 255;
}

function baseLuma(x, y) {
  return baseGray[Math.round(y - 0.5) * W + Math.round(x - 0.5)];
}

/** 窓の中で、コマを (dx, dy) ずらしたときの元画像との正規化相互相関 */
function windowCorrelation(patch, win, dx, dy) {
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = win.y; y < win.y + win.height; y++) {
    for (let x = win.x; x < win.x + win.width; x++) {
      const b = patchLuma(patch, x + 0.5 + dx, y + 0.5 + dy);
      if (b === null) continue;
      const a = baseLuma(x + 0.5, y + 0.5);
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  }
  if (n < 16) return -1;
  const covariance = sab - (sa * sb) / n;
  return covariance / Math.sqrt((saa - (sa * sa) / n) * (sbb - (sb * sb) / n) + 1e-12);
}

/** 窓を動かして、元画像と最もよく重なるずれ */
function bestShift(patch, win, xs, ys) {
  let best = { score: -2, dx: 0, dy: 0 };
  for (const dy of ys) {
    for (const dx of xs) {
      const score = windowCorrelation(patch, win, dx, dy);
      if (score > best.score) best = { score, dx, dy };
    }
  }
  return best;
}

/** あごの下がり、唇の間の暗い部分の割合、口角の間隔の変化 */
function measure(patch) {
  // あご:唇の下からあご先までの窓を縦に動かし、元画像と最もよく重なる位置
  const chinWindow = {
    x: Math.round(chin.x - mouthHalf * 0.7),
    y: Math.round(mouth.y + toChin * 0.55),
    width: Math.round(mouthHalf * 1.4),
    height: Math.round(toChin * 0.47),
  };
  const jaw = bestShift(patch, chinWindow, [0], range(-Math.round(toChin * 0.1), Math.round(toChin * 0.45))).dy;

  // 口の中:唇の合わせ目のまわりで、肌よりかなり暗い部分の割合
  const box = { x0: mouthLeft.x + 3, x1: mouthRight.x - 2, y0: mouth.y - toChin * 0.18, y1: mouth.y + toChin * 0.43 };
  const skin = median(
    range(Math.round(box.x0), Math.round(box.x1)).flatMap((x) => range(Math.round(box.y0), Math.round(box.y1)).map((y) => baseLuma(x + 0.5, y + 0.5))),
  );
  let dark = 0;
  let total = 0;
  for (let y = Math.round(box.y0); y < box.y1; y++) {
    for (let x = Math.round(box.x0); x < box.x1; x++) {
      total++;
      if (patchLuma(patch, x + 0.5, y + 0.5) < skin * 0.47) dark++;
    }
  }

  // 口角:左右の口角のまわりの窓を動かし、元画像と最もよく重なる横のずれ
  const corner = (p) => bestShift(patch, { x: Math.round(p.x - 9), y: Math.round(p.y - 7), width: 18, height: 14 }, range(-10, 10), range(-6, 6, 2)).dx;
  const width = corner(mouthRight) - corner(mouthLeft);
  return { jaw, dark: dark / total, width };
}

/** 口元を FEATURE_GRID × FEATURE_GRID に縮小した輝度(0〜255) */
function feature(patch) {
  const x0 = mouth.x - mouthHalf * 1.25;
  const y0 = mouth.y - toChin * 0.35;
  const size = mouthHalf * 2.5;
  const cell = size / FEATURE_GRID;
  const out = Buffer.alloc(FEATURE_GRID * FEATURE_GRID);
  for (let gy = 0; gy < FEATURE_GRID; gy++) {
    for (let gx = 0; gx < FEATURE_GRID; gx++) {
      let sum = 0;
      let n = 0;
      for (let y = y0 + gy * cell; y < y0 + (gy + 1) * cell; y++) {
        for (let x = x0 + gx * cell; x < x0 + (gx + 1) * cell; x++) {
          const v = patchLuma(patch, x + 0.5, y + 0.5);
          if (v === null) continue;
          sum += v;
          n++;
        }
      }
      out[gy * FEATURE_GRID + gx] = Math.round((n ? sum / n : 0) * 255);
    }
  }
  return out;
}

function range(from, to, step = 1) {
  return Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** 下位5%・上位5%の値(外れ値に引きずられないよう、正規化の範囲に使う) */
function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return [sorted[Math.floor((sorted.length - 1) * 0.05)], sorted[Math.floor((sorted.length - 1) * 0.95)]];
}

function normalize(value, [low, high]) {
  return high > low ? clamp((value - low) / (high - low), 0, 1) : 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

async function probe(file) {
  const output = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file]);
  const stream = JSON.parse(output.toString()).streams[0];
  const [num, den] = stream.r_frame_rate.split("/").map(Number);
  return { width: stream.width, height: stream.height, fps: round(num / (den || 1), 3) };
}

/** 動画のコマを順に取り出す(すべてを一度にメモリに載せない) */
function forEachFrame(file, width, height, handle) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-i", file, "-vf", `scale=${width}:${height}:flags=lanczos`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    const size = width * height * 3;
    let frame = Buffer.alloc(size);
    let filled = 0;
    let index = 0;
    const errors = [];
    child.stdout.on("data", (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        const n = Math.min(size - filled, chunk.length - offset);
        chunk.copy(frame, filled, offset, offset + n);
        filled += n;
        offset += n;
        if (filled === size) {
          handle(frame, index++);
          frame = Buffer.alloc(size);
          filled = 0;
        }
      }
    });
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${Buffer.concat(errors).toString()}`))));
  });
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`${command}: ${Buffer.concat(errors).toString()}`))));
  });
}
