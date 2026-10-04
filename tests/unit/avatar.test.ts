import { describe, expect, it } from "vitest";
import { AvatarBehavior, blinkCurve, type BehaviorInput } from "@/features/avatar/behavior";
import { analyzeFrame, approach, MORA_MS, mouthAt, textToMorae } from "@/features/avatar/lip-sync";
import {
  manifestFromPoints,
  PLACEHOLDER_AVATAR,
  validateFacePoints,
  viewRect,
  type FacePoints,
} from "@/features/avatar/manifest";
import { buildRig } from "@/features/avatar/rig";

const placeholderPoints: FacePoints = {
  leftEye: PLACEHOLDER_AVATAR.eyes[0].center,
  rightEye: PLACEHOLDER_AVATAR.eyes[1].center,
  mouth: PLACEHOLDER_AVATAR.mouth.center,
  chin: PLACEHOLDER_AVATAR.chin,
};

describe("manifest", () => {
  it("4点から推定した顔の形が、実際の顔に近い", () => {
    const derived = manifestFromPoints(placeholderPoints, { src: "x", width: 1024, height: 1024 });
    expect(derived.mouth.left.x).toBeCloseTo(PLACEHOLDER_AVATAR.mouth.left.x, -1);
    expect(derived.mouth.right.x).toBeCloseTo(PLACEHOLDER_AVATAR.mouth.right.x, -1);
    expect(derived.eyes[0].width).toBeCloseTo(PLACEHOLDER_AVATAR.eyes[0].width, -1);
    expect(derived.eyes[0].height).toBeCloseTo(PLACEHOLDER_AVATAR.eyes[0].height, -1);
    expect(Math.abs(derived.headTop.y - PLACEHOLDER_AVATAR.headTop.y)).toBeLessThan(40);
  });

  it("顔が傾いていても、口の両端は目を結ぶ線と平行に置く", () => {
    const tilted = manifestFromPoints(
      { leftEye: { x: 100, y: 100 }, rightEye: { x: 200, y: 120 }, mouth: { x: 140, y: 200 }, chin: { x: 135, y: 260 } },
      { src: "x", width: 400, height: 400 },
    );
    const slope = (tilted.mouth.right.y - tilted.mouth.left.y) / (tilted.mouth.right.x - tilted.mouth.left.x);
    expect(slope).toBeCloseTo(0.2, 5);
  });

  it("クリックの誤りを見つける", () => {
    expect(validateFacePoints(placeholderPoints)).toBeNull();
    expect(validateFacePoints({ ...placeholderPoints, leftEye: placeholderPoints.rightEye, rightEye: placeholderPoints.leftEye })).toMatch(
      "逆",
    );
    expect(validateFacePoints({ ...placeholderPoints, chin: { x: 512, y: 590 } })).toMatch("あご");
    expect(validateFacePoints({ ...placeholderPoints, mouth: { x: 512, y: 450 } })).toMatch("口");
  });

  it("表示範囲は画像の内側に収める", () => {
    const view = viewRect(PLACEHOLDER_AVATAR);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.x + view.size).toBeLessThanOrEqual(1024);
    expect(view.y + view.size).toBeLessThanOrEqual(1024);
    expect(view.y).toBeLessThan(PLACEHOLDER_AVATAR.headTop.y);

    const small = viewRect(manifestFromPoints(placeholderPoints, { src: "x", width: 700, height: 700 }));
    expect(small.size).toBeLessThanOrEqual(700);
    expect(small.x + small.size).toBeLessThanOrEqual(700);
  });

  it("描画用の形を作る", () => {
    const rig = buildRig(PLACEHOLDER_AVATAR);
    expect(rig.unit).toBe(144);
    expect(rig.roll).toBe(0);
    expect(rig.mouthHalfWidth).toBe(51);
    expect(rig.pivot.y).toBeGreaterThan(PLACEHOLDER_AVATAR.chin.y);
  });
});

describe("textToMorae", () => {
  const vowels = (text: string) => textToMorae(text).map((m) => m.vowel).join(" ");

  it("ひらがな・カタカナを母音にする", () => {
    expect(vowels("こんにちは")).toBe("o n i i a");
    expect(vowels("カタカナ")).toBe("a a a a");
  });

  it("小さい「ゃ」などは前の拍の母音を変え、「ー」は前の拍を伸ばす", () => {
    expect(vowels("きょう")).toBe("o u");
    const morae = textToMorae("データ");
    expect(morae.map((m) => m.vowel).join(" ")).toBe("e a");
    expect(morae[0].ms).toBe(MORA_MS * 2);
  });

  it("句読点は口を閉じる間、漢字は2拍とみなす", () => {
    expect(vowels("はい、")).toBe("a i pause");
    expect(textToMorae("本日").length).toBe(4);
    expect(vowels("「 」")).toBe("");
  });
});

describe("mouthAt", () => {
  it("母音に応じて口を開き、間では閉じる", () => {
    const morae = textToMorae("あ。い");
    const a = mouthAt(morae, MORA_MS / 2);
    expect(a.open).toBeGreaterThan(0.8);
    expect(mouthAt(morae, MORA_MS + 100).open).toBe(0);
    const i = mouthAt(morae, MORA_MS + 380 + MORA_MS / 2);
    expect(i.wide).toBeGreaterThan(0.5);
    expect(i.open).toBeLessThan(a.open);
  });

  it("拍の並びの最後まで来たら先頭に戻る", () => {
    const morae = textToMorae("あい");
    expect(mouthAt(morae, MORA_MS * 2 + MORA_MS / 2)).toEqual(mouthAt(morae, MORA_MS / 2));
    expect(mouthAt([], 100).open).toBe(0);
  });
});

describe("analyzeFrame", () => {
  const sampleRate = 48_000;
  const bins = 512;
  const tone = (amplitude: number) => Float32Array.from({ length: 1024 }, (_, i) => amplitude * Math.sin(i / 3));
  const spectrumAt = (hz: number) => {
    const spectrum = new Float32Array(bins).fill(-120);
    spectrum[Math.round(hz / (sampleRate / 2 / bins))] = -10;
    return spectrum;
  };

  it("無音では口を閉じ、大きな音では開く", () => {
    expect(analyzeFrame(tone(0.0005), spectrumAt(1000), sampleRate).open).toBe(0);
    expect(analyzeFrame(tone(0.2), spectrumAt(1000), sampleRate).open).toBeGreaterThan(0.9);
  });

  it("高い成分が多いと横に広げ、低い成分が多いとすぼめる", () => {
    expect(analyzeFrame(tone(0.05), spectrumAt(2400), sampleRate).wide).toBeGreaterThan(0.5);
    expect(analyzeFrame(tone(0.05), spectrumAt(500), sampleRate).wide).toBeLessThan(-0.5);
  });
});

describe("approach", () => {
  it("時定数の経過で約63%近づき、間隔0では変わらない", () => {
    expect(approach(0, 1, 100, 100)).toBeCloseTo(1 - Math.exp(-1), 5);
    expect(approach(0.3, 1, 0, 100)).toBeCloseTo(0.3, 10);
  });
});

describe("AvatarBehavior", () => {
  const closed = { open: 0, wide: 0 };
  const input = (mode: BehaviorInput["mode"], candidateVoice = false): BehaviorInput => ({ mode, mouth: closed, candidateVoice });

  function run(behavior: AvatarBehavior, from: number, to: number, make: (t: number) => BehaviorInput) {
    const poses = [];
    for (let t = from; t <= to; t += 16) poses.push({ t, pose: behavior.update(t, make(t)) });
    return poses;
  }

  it("数秒に1回まばたきする", () => {
    const behavior = new AvatarBehavior(() => 0.5);
    const poses = run(behavior, 0, 10_000, () => input("idle"));
    const closedFrames = poses.filter((p) => p.pose.blink > 0.9).map((p) => p.t);
    expect(closedFrames.length).toBeGreaterThan(0);
    expect(closedFrames[0]).toBeLessThan(3500);
    expect(blinkCurve(85)).toBe(1);
    expect(blinkCurve(400)).toBe(0);
  });

  it("求職者が1.2秒以上話して区切ると、相づちのうなずきをする", () => {
    const behavior = new AvatarBehavior(() => 0);
    const poses = run(behavior, 0, 3000, (t) => input("listening", t < 1500));
    expect(Math.max(...poses.filter((p) => p.t < 1500).map((p) => p.pose.nod))).toBe(0);
    expect(Math.max(...poses.filter((p) => p.t >= 1500).map((p) => p.pose.nod))).toBeGreaterThan(0.5);
  });

  it("短い声ではうなずかない", () => {
    const behavior = new AvatarBehavior(() => 0);
    const poses = run(behavior, 0, 3000, (t) => input("listening", t > 500 && t < 1000));
    expect(Math.max(...poses.map((p) => p.pose.nod))).toBe(0);
  });

  it("回答が終わって考え始めると、うなずく", () => {
    const behavior = new AvatarBehavior(() => 0);
    const poses = run(behavior, 0, 2000, (t) => input(t < 1000 ? "listening" : "thinking"));
    expect(Math.max(...poses.filter((p) => p.t >= 1000).map((p) => p.pose.nod))).toBeGreaterThan(0.9);
  });
});
