import { distance, midpoint, viewRect, type AvatarManifest, type Point } from "./manifest";

/** 1フレーム分の顔の動き。値はすべて顔の大きさに依存しない単位 */
export type AvatarPose = {
  /** 口の開き(0〜1) */
  mouthOpen: number;
  /** 口の形(-1 すぼめる 〜 +1 横に広げる) */
  mouthWide: number;
  /** まぶたの閉じ具合(0 開いている 〜 1 閉じている) */
  blink: number;
  /** 頭の傾き(ラジアン。正の値で画面上の時計回り) */
  headRoll: number;
  /** 頭の位置のずれ(目の間隔を1とした単位) */
  headX: number;
  headY: number;
  /** うなずき(0〜1) */
  nod: number;
  /** 呼吸による体の上下(-1〜1) */
  breath: number;
};

export const NEUTRAL_POSE: AvatarPose = {
  mouthOpen: 0,
  mouthWide: 0,
  blink: 0,
  headRoll: 0,
  headX: 0,
  headY: 0,
  nod: 0,
  breath: 0,
};

/** 描画に使う顔の形(画像のピクセル単位)。画像ごとに1回だけ計算する */
export type FaceRig = {
  imageSize: [number, number];
  view: { x: number; y: number; size: number };
  /** 顔の傾き(目を結ぶ線の角度) */
  roll: number;
  eyes: [{ center: Point; halfWidth: number; halfHeight: number }, { center: Point; halfWidth: number; halfHeight: number }];
  mouthCenter: Point;
  mouthHalfWidth: number;
  /** 唇の合わせ目からあご先までの距離 */
  chinDistance: number;
  /** 頭を動かすときの回転の中心(首) */
  pivot: Point;
  /** 頭として動かす範囲(楕円) */
  headCenter: Point;
  headRadii: [number, number];
  /** 目の間隔。動きの大きさの基準 */
  unit: number;
};

export function buildRig(manifest: AvatarManifest): FaceRig {
  const [left, right] = manifest.eyes;
  const unit = distance(left.center, right.center);
  const roll = Math.atan2(right.center.y - left.center.y, right.center.x - left.center.x);
  const eyeMid = midpoint(left.center, right.center);
  const { chin, headTop } = manifest;
  const mouthCenter = manifest.mouth.center;
  const mouthHalfWidth = distance(manifest.mouth.left, manifest.mouth.right) / 2;
  const faceHeight = distance(headTop, chin);
  return {
    imageSize: [manifest.width, manifest.height],
    view: viewRect(manifest),
    roll,
    eyes: [left, right].map((eye) => ({ center: eye.center, halfWidth: eye.width / 2, halfHeight: eye.height / 2 })) as FaceRig["eyes"],
    mouthCenter,
    mouthHalfWidth,
    chinDistance: distance(mouthCenter, chin),
    pivot: { x: chin.x + (chin.x - eyeMid.x) * 0.45, y: chin.y + (chin.y - eyeMid.y) * 0.45 },
    headCenter: midpoint(headTop, chin),
    headRadii: [Math.max(unit * 1.45, faceHeight * 0.36), faceHeight * 0.56],
    unit,
  };
}

/** 動きを弱める設定(OS の「視差効果を減らす」)。口とまばたきはそのまま、頭の動きだけ小さくする */
export function reducePose(pose: AvatarPose, factor: number): AvatarPose {
  return {
    ...pose,
    headRoll: pose.headRoll * factor,
    headX: pose.headX * factor,
    headY: pose.headY * factor,
    nod: pose.nod * factor,
    breath: pose.breath * factor,
  };
}
