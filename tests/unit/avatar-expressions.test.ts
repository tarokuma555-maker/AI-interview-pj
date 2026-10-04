import { describe, expect, it } from "vitest";
import { ALIGN_MIN_SCORE, alignSimilarity, applySimilarity, sample, type GrayImage, type Similarity } from "@/features/avatar/align";
import { mouthAt, textToMorae, MORA_MS } from "@/features/avatar/lip-sync";
import {
  alignmentAreas,
  avatarManifestSchema,
  expressionRegions,
  PLACEHOLDER_AVATAR,
  type Rect,
} from "@/features/avatar/manifest";
import { MouthImageMixer } from "@/features/avatar/mouth-images";

/** 再現できる乱数 */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** ぼかした点を散らした、顔写真のように濃淡のある画像 */
function texturedImage(size: number, seed: number): Float32Array {
  const rand = random(seed);
  const blobs = Array.from({ length: 70 }, () => ({ x: rand() * size, y: rand() * size, r: 3 + rand() * 14, v: rand() - 0.5 }));
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0.5;
      for (const b of blobs) value += b.v * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.r * b.r));
      data[y * size + x] = value;
    }
  }
  return data;
}

/** base を変換 t で動かした画像(v = t(p) となる位置に p の画素が来る) */
function transformImage(base: Float32Array, size: number, t: Similarity): Float32Array {
  const image: GrayImage = { width: size, height: size, data: base, scale: 1 };
  const out = new Float32Array(size * size);
  const cos = Math.cos(-t.angle) / t.scale;
  const sin = Math.sin(-t.angle) / t.scale;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - t.cx - t.tx;
      const dy = y + 0.5 - t.cy - t.ty;
      out[y * size + x] = sample(image, t.cx + cos * dx - sin * dy, t.cy + sin * dx + cos * dy) ?? 0.5;
    }
  }
  return out;
}

function pyramid(data: Float32Array, size: number, widths: number[]): GrayImage[] {
  return widths.map((width) => {
    const factor = size / width;
    const out = new Float32Array(width * width);
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let j = 0; j < factor; j++) for (let i = 0; i < factor; i++) sum += data[(y * factor + j) * size + x * factor + i];
        out[y * width + x] = sum / (factor * factor);
      }
    }
    return { width, height: width, data: out, scale: width / size };
  });
}

describe("alignSimilarity", () => {
  const size = 256;
  const widths = [32, 64, 128, 256];
  const areas: Rect[] = [{ x: 60, y: 40, width: 136, height: 90 }];
  const base = texturedImage(size, 7);

  it("ずれた・拡大した・傾いた画像の位置を見つける(合わせる範囲の外が違っていても)", () => {
    const truth: Similarity = { scale: 1.04, angle: (1.5 * Math.PI) / 180, tx: 9, ty: -6, cx: 128, cy: 85 };
    const variant = transformImage(base, size, truth);
    // 口にあたる部分(合わせる範囲の外)は別の模様にする
    const other = texturedImage(size, 99);
    for (let y = 170; y < 240; y++) for (let x = 70; x < 190; x++) variant[y * size + x] = other[y * size + x];

    const result = alignSimilarity(pyramid(base, size, widths), pyramid(variant, size, widths), areas, size);
    expect(result.score).toBeGreaterThan(0.95);
    for (const p of [{ x: 70, y: 50 }, { x: 190, y: 50 }, { x: 128, y: 200 }]) {
      const expected = applySimilarity(truth, p);
      const actual = applySimilarity(result.transform, p);
      expect(Math.hypot(actual.x - expected.x, actual.y - expected.y)).toBeLessThan(1);
    }
  });

  it("同じ画像なら、動かさない", () => {
    const result = alignSimilarity(pyramid(base, size, widths), pyramid(base, size, widths), areas, size);
    expect(result.score).toBeGreaterThan(0.99);
    const p = applySimilarity(result.transform, { x: 100, y: 100 });
    expect(Math.hypot(p.x - 100, p.y - 100)).toBeLessThan(0.5);
  });

  it("別の画像なら、重なり具合が基準に届かない", () => {
    const unrelated = texturedImage(size, 1234);
    const result = alignSimilarity(pyramid(base, size, widths), pyramid(unrelated, size, widths), areas, size);
    expect(result.score).toBeLessThan(ALIGN_MIN_SCORE);
  });
});

describe("expressionRegions / alignmentAreas", () => {
  it("口の範囲は唇とあごを、目の範囲は両目を含み、画像の内側に収まる", () => {
    const { mouth, eyes } = expressionRegions(PLACEHOLDER_AVATAR);
    const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    expect(inside(mouth.rect, PLACEHOLDER_AVATAR.mouth.left.x, 575)).toBe(true);
    expect(inside(mouth.rect, 512, PLACEHOLDER_AVATAR.chin.y)).toBe(true);
    expect(inside(eyes.rect, 440, 439) && inside(eyes.rect, 584, 439)).toBe(true);
    for (const r of [mouth.rect, eyes.rect]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(1024);
      expect(Number.isInteger(r.x) && Number.isInteger(r.width)).toBe(true);
    }
    // 楕円の内側60%(表情の画像そのものを使う範囲)に唇の両端が入る
    const e = mouth.ellipses[0];
    expect(Math.abs(PLACEHOLDER_AVATAR.mouth.left.x - e.cx) / e.rx).toBeLessThan(0.6);
  });

  it("位置合わせには、表情で変わる部分を使わない", () => {
    const [mouthArea] = alignmentAreas(PLACEHOLDER_AVATAR, "mouth");
    expect(mouthArea.y + mouthArea.height).toBeLessThan(PLACEHOLDER_AVATAR.mouth.center.y - 30);
    const eyeAreas = alignmentAreas(PLACEHOLDER_AVATAR, "eyes");
    expect(eyeAreas).toHaveLength(2);
    for (const area of eyeAreas) expect(area.y > 439 + 15 || area.y + area.height < 439 - 15).toBe(true);
  });

  it("表情の画像を持つ設定を読み込める", () => {
    expect(avatarManifestSchema.safeParse(PLACEHOLDER_AVATAR).success).toBe(true);
    const custom = { ...PLACEHOLDER_AVATAR, expressions: { mouth: { a: { src: "data:x", rect: { x: 1, y: 2, width: 30, height: 40 } } } } };
    expect(avatarManifestSchema.parse(custom).expressions?.mouth?.a?.rect?.width).toBe(30);
  });
});

describe("MouthImageMixer", () => {
  const settle = (mixer: MouthImageMixer, mouth: Parameters<MouthImageMixer["update"]>[0]) => {
    let result = mixer.update(mouth, 0);
    for (let i = 0; i < 30; i++) result = mixer.update(mouth, 16);
    return result;
  };

  it("母音が分かれば、その母音の画像を使う", () => {
    const mixer = new MouthImageMixer(["a", "i", "u", "e", "o"]);
    const settled = settle(mixer, { open: 0.3, wide: 0.75, vowel: "i" });
    expect(settled).toHaveLength(1);
    expect(settled[0].key).toBe("i");
    expect(settled[0].weight).toBeCloseTo(1, 4);
    const morae = textToMorae("お");
    const shape = mouthAt(morae, MORA_MS / 2);
    expect(shape.vowel).toBe("o");
    expect(mixer.pick(shape)?.key).toBe("o");
  });

  it("母音が分からなければ、口の開きと形が近い画像を使う", () => {
    const mixer = new MouthImageMixer(["a", "i", "o"]);
    expect(mixer.pick({ open: 0.85, wide: 0 })?.key).toBe("a");
    expect(mixer.pick({ open: 0.3, wide: 0.7 })?.key).toBe("i");
    expect(mixer.pick({ open: 0.6, wide: -0.6 })?.key).toBe("o");
    // 用意されていない母音は、近い画像で代わりにする
    expect(mixer.pick({ open: 0.3, wide: -0.7, vowel: "u" })?.key).toBe("o");
  });

  it("口の開きが小さいと薄く重ね、閉じたら元画像に戻る", () => {
    const mixer = new MouthImageMixer(["a"]);
    const half = settle(mixer, { open: 0.38, wide: 0 });
    expect(half[0].weight).toBeGreaterThan(0.4);
    expect(half[0].weight).toBeLessThan(0.6);
    expect(settle(mixer, { open: 0, wide: 0 })).toEqual([]);
  });

  it("切り替えの途中は2つの画像を重ね、重みの合計は1以下", () => {
    const mixer = new MouthImageMixer(["a", "i"]);
    settle(mixer, { open: 0.9, wide: 0.1, vowel: "a" });
    const during = mixer.update({ open: 0.3, wide: 0.75, vowel: "i" }, 30);
    expect(during.map((w) => w.key).sort()).toEqual(["a", "i"]);
    expect(during.reduce((s, w) => s + w.weight, 0)).toBeLessThanOrEqual(1.0001);
  });

  it("画像がなければ使わない", () => {
    const mixer = new MouthImageMixer([]);
    expect(mixer.enabled).toBe(false);
    expect(mixer.update({ open: 1, wide: 0 }, 16)).toEqual([]);
  });
});
