import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { expressionRegions, STANDARD_AVATAR } from "@/features/avatar/manifest";
import {
  createMouthFramePlayer,
  decodeFeatures,
  frameDistances,
  MouthFramePlayer,
  mouthFramesSchema,
  type MouthFrameBlend,
  type MouthFrameInfo,
} from "@/features/avatar/mouth-frames";
import { mouthAt, textToMorae, type MouthShape } from "@/features/avatar/lip-sync";

const SATO = mouthFramesSchema.parse(JSON.parse(readFileSync("public/avatars/sato/mouth-frames.json", "utf8")));
const STEP = 1000 / 60;

/** 一定の口の形を、指定した時間だけ与える */
function run(player: MouthFramePlayer, shape: (ms: number) => MouthShape, ms: number): MouthFrameBlend[] {
  const out: MouthFrameBlend[] = [];
  for (let t = 0; t < ms; t += STEP) out.push(player.update(shape(t), STEP));
  return out;
}

/** 開きが順に 0 → 1 → 0 と変わる、24コマ/秒の動画のコマ(見た目の違いは開きの差とする) */
function syntheticFrames(count: number): { frames: MouthFrameInfo[]; distances: Float32Array } {
  const frames = Array.from({ length: count }, (_, i) => ({ open: Math.abs(Math.sin((i / count) * Math.PI * 4)), wide: 0, jaw: i % 7 }));
  const features = Uint8Array.from(frames.map((f) => Math.round(f.open * 255)));
  return { frames, distances: frameDistances(features, 1, count) };
}

describe("標準の面接官の口元のコマ", () => {
  it("読み込める形で、口元の画像と同じ範囲に重ねる", () => {
    expect(SATO.rect).toEqual(expressionRegions(STANDARD_AVATAR).mouth.rect);
    expect(STANDARD_AVATAR.mouthFrames).toBe("/avatars/sato/mouth-frames.json");
    expect(SATO.image).toBe("/avatars/sato/mouth-frames.webp");
    expect(decodeFeatures(SATO)).toHaveLength(SATO.frames.length * SATO.featureSize);
    // 閉じたコマから大きく開いたコマまで、そろっている
    const opens = SATO.frames.map((f) => f.open);
    expect(Math.min(...opens)).toBe(0);
    expect(Math.max(...opens)).toBe(1);
  });

  it("文章の読み上げに合わせて再生すると、口が開き、句点では閉じ、話している間は止まり続けない", () => {
    const player = createMouthFramePlayer(SATO);
    const morae = textToMorae("本日はよろしくお願いいたします。それでは自己紹介をお願いします。");
    let shape: MouthShape = { open: 0, wide: 0 };
    let held = 0;
    let longestHold = 0;
    let closedAtPause = false;
    for (let t = 0; t < 4000; t += STEP) {
      const target = mouthAt(morae, t);
      shape = { open: shape.open + (target.open - shape.open) * 0.4, wide: target.wide };
      const blend = player.update(shape, STEP);
      const open = SATO.frames[blend.from].open * (1 - blend.mix) + SATO.frames[blend.to].open * blend.mix;
      held = blend.from === blend.to && shape.open > 0.04 ? held + STEP : 0;
      longestHold = Math.max(longestHold, held);
      // 「いたします。」の後の間(およそ 2.3〜2.6 秒)
      if (t > 2450 && t < 2600 && open < 0.1) closedAtPause = true;
    }
    expect(closedAtPause).toBe(true);
    expect(longestHold).toBeLessThan(200);
  });
});

describe("MouthFramePlayer", () => {
  it("声がなければ閉じたコマで止まっている", () => {
    const { frames, distances } = syntheticFrames(48);
    const player = new MouthFramePlayer(frames, 24, distances);
    const blends = run(player, () => ({ open: 0, wide: 0 }), 1000);
    for (const b of blends) {
      expect(b.from).toBe(b.to);
      expect(frames[b.from].open).toBeLessThan(0.05);
    }
  });

  it("声が出ている間だけコマを重ね、話し終えて少したつと元画像の口へ戻す(読点などの短い間では戻さない)", () => {
    const { frames, distances } = syntheticFrames(48);
    const player = new MouthFramePlayer(frames, 24, distances);
    expect(run(player, () => ({ open: 0, wide: 0 }), 500).every((b) => b.weight === 0)).toBe(true);
    const speaking = run(player, () => ({ open: 0.6, wide: 0 }), 300);
    expect(speaking[3].weight).toBeGreaterThan(0.5);
    expect(speaking.at(-1)!.weight).toBeGreaterThan(0.99);
    const shortPause = run(player, () => ({ open: 0, wide: 0 }), 220);
    expect(Math.min(...shortPause.map((b) => b.weight))).toBeGreaterThan(0.99);
    const longPause = run(player, () => ({ open: 0, wide: 0 }), 1200);
    expect(longPause.at(-1)!.weight).toBe(0);
    // 戻っていく間は、閉じたコマを重ねている
    expect(frames[longPause.at(-1)!.to].open).toBeLessThan(0.05);
  });

  it("目標が動画の動きと同じなら、動画の順番どおりに再生する", () => {
    const { frames, distances } = syntheticFrames(48);
    const player = new MouthFramePlayer(frames, 24, distances);
    // 目標を動画の開きの変化に合わせる(動画の時刻 = 経過時間)
    const blends = run(player, (t) => ({ open: frames[Math.min(47, Math.floor((t / 1000) * 24) + 1)].open, wide: 0 }), 1800);
    const steps = blends.filter((b, i) => i > 0 && b.to !== blends[i - 1].to);
    const forward = steps.filter((b) => b.to === b.from + 1).length;
    expect(forward / steps.length).toBeGreaterThan(0.8);
  });

  it("前のコマから次のコマへ少しずつ重ね合わせ、あごの下がりも間をとる", () => {
    const { frames, distances } = syntheticFrames(48);
    const player = new MouthFramePlayer(frames, 24, distances);
    const blends = run(player, (t) => ({ open: t < 100 ? 0 : 0.8, wide: 0 }), 600);
    const moving = blends.filter((b) => b.from !== b.to);
    expect(moving.length).toBeGreaterThan(0);
    for (const b of moving) {
      expect(b.mix).toBeGreaterThanOrEqual(0);
      expect(b.mix).toBeLessThan(1);
      const low = Math.min(frames[b.from].jaw, frames[b.to].jaw);
      const high = Math.max(frames[b.from].jaw, frames[b.to].jaw);
      expect(b.jaw).toBeGreaterThanOrEqual(low - 1e-9);
      expect(b.jaw).toBeLessThanOrEqual(high + 1e-9);
    }
  });

  it("続けて再生できないコマ(動画で前のコマを使っていない)へは、順番どおりとして進まない", () => {
    const frames: MouthFrameInfo[] = [
      { open: 0, wide: 0, jaw: 0 },
      { open: 0.5, wide: 0, jaw: 0, cut: true },
      { open: 1, wide: 0, jaw: 0 },
    ];
    const distances = frameDistances(Uint8Array.from([0, 128, 255]), 1, 3);
    const player = new MouthFramePlayer(frames, 24, distances);
    // 1 は 0 の続きではないため、0 から 1 へは離れたコマへ移るのと同じ扱い(長めに重ね合わせる)
    expect(player.next(0, { open: 0.5, wide: 0 })).toEqual({ frame: 1, steps: 2 });
    expect(player.next(1, { open: 1, wide: 0 })).toEqual({ frame: 2, steps: 1 });
  });

  it("コマどうしの見た目の違いは、同じコマで0、左右対称で、中央値が1になる", () => {
    const features = Uint8Array.from([0, 0, 10, 10, 30, 30, 60, 60]);
    const d = frameDistances(features, 2, 4);
    for (let i = 0; i < 4; i++) {
      expect(d[i * 4 + i]).toBe(0);
      for (let j = 0; j < 4; j++) expect(d[i * 4 + j]).toBeCloseTo(d[j * 4 + i], 6);
    }
    const off = [...d].filter((_, k) => k % 4 !== Math.floor(k / 4)).sort((a, b) => a - b);
    expect(off[Math.floor(off.length / 2)]).toBeCloseTo(1, 6);
  });

  it("情報が壊れていれば読み込まない", () => {
    expect(() => decodeFeatures({ ...SATO, features: "AAAA" })).toThrow();
    expect(mouthFramesSchema.safeParse({ ...SATO, frames: [] }).success).toBe(false);
  });
});
