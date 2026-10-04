import { z } from "zod";

/**
 * 面接官アバターの顔画像と、目・口などの位置(設計書 3.12)。
 * 位置は元画像のピクセル座標(左上が原点)で持つ。
 */

const pointSchema = z.object({ x: z.number(), y: z.number() });
const eyeSchema = z.object({ center: pointSchema, width: z.number().positive(), height: z.number().positive() });

export const avatarManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 画像の URL(public の画像、またはブラウザ内で読み込んだ data URL) */
  src: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** 画像の左側に写っている目・右側に写っている目の中心と、目の開きの幅・高さ */
  eyes: z.tuple([eyeSchema, eyeSchema]),
  /** 口の両端と、唇の合わせ目の中心 */
  mouth: z.object({ left: pointSchema, right: pointSchema, center: pointSchema }),
  chin: pointSchema,
  /** 頭のてっぺん(髪を含む) */
  headTop: pointSchema,
});

export type Point = z.infer<typeof pointSchema>;
export type EyeLandmark = z.infer<typeof eyeSchema>;
export type AvatarManifest = z.infer<typeof avatarManifestSchema>;

/** 画像の上でクリックしてもらう4点(自分の画像を使う場合) */
export type FacePoints = { leftEye: Point; rightEye: Point; mouth: Point; chin: Point };

export const FACE_POINT_ORDER: (keyof FacePoints)[] = ["leftEye", "rightEye", "mouth", "chin"];

export const FACE_POINT_LABELS: Record<keyof FacePoints, string> = {
  leftEye: "向かって左の目の中心",
  rightEye: "向かって右の目の中心",
  mouth: "口の中心(唇の合わせ目)",
  chin: "あごの先",
};

/** 試作版の仮の顔(public/avatars/placeholder.svg) */
export const PLACEHOLDER_AVATAR: AvatarManifest = {
  id: "placeholder",
  name: "仮の面接官(イラスト)",
  src: "/avatars/placeholder.svg",
  width: 1024,
  height: 1024,
  eyes: [
    { center: { x: 440, y: 439 }, width: 72, height: 30 },
    { center: { x: 584, y: 439 }, width: 72, height: 30 },
  ],
  mouth: { left: { x: 461, y: 575 }, right: { x: 563, y: 575 }, center: { x: 512, y: 577 } },
  chin: { x: 512, y: 664 },
  headTop: { x: 512, y: 182 },
};

/**
 * 4点から、目の大きさ・口の幅・頭の範囲を一般的な顔の比率で推定する。
 * 比率は、正面を向いた顔で目の中心どうしの距離を1としたときの目安。
 */
export function manifestFromPoints(
  points: FacePoints,
  image: { src: string; width: number; height: number },
  id = "custom",
  name = "自分で用意した画像",
): AvatarManifest {
  const { leftEye, rightEye, mouth, chin } = points;
  const eyeDistance = distance(leftEye, rightEye);
  const axis = { x: (rightEye.x - leftEye.x) / eyeDistance, y: (rightEye.y - leftEye.y) / eyeDistance };
  const mouthHalf = eyeDistance * 0.36;
  const eyeMid = midpoint(leftEye, rightEye);
  const down = { x: chin.x - eyeMid.x, y: chin.y - eyeMid.y };
  const eye = (center: Point): EyeLandmark => ({ center, width: eyeDistance * 0.5, height: eyeDistance * 0.2 });
  return {
    id,
    name,
    src: image.src,
    width: image.width,
    height: image.height,
    eyes: [eye(leftEye), eye(rightEye)],
    mouth: {
      left: { x: mouth.x - axis.x * mouthHalf, y: mouth.y - axis.y * mouthHalf },
      right: { x: mouth.x + axis.x * mouthHalf, y: mouth.y + axis.y * mouthHalf },
      center: mouth,
    },
    chin,
    headTop: { x: eyeMid.x - down.x * 1.15, y: eyeMid.y - down.y * 1.15 },
  };
}

/** 4点が顔として不自然な配置でないか(クリックの誤りを見つける) */
export function validateFacePoints(points: FacePoints): string | null {
  const { leftEye, rightEye, mouth, chin } = points;
  const eyeDistance = distance(leftEye, rightEye);
  if (eyeDistance < 8) return "目の位置が近すぎます。もう一度やり直してください";
  if (rightEye.x <= leftEye.x) return "左右の目が逆になっています。向かって左の目から順にクリックしてください";
  const eyeMid = midpoint(leftEye, rightEye);
  const mouthDrop = mouth.y - eyeMid.y;
  const chinDrop = chin.y - mouth.y;
  if (mouthDrop < eyeDistance * 0.5 || mouthDrop > eyeDistance * 2) return "口の位置が目から離れすぎているか、近すぎます";
  if (chinDrop < eyeDistance * 0.2 || chinDrop > eyeDistance * 1.5) return "あごの位置が口から離れすぎているか、近すぎます";
  return null;
}

/** 画面に表示する範囲(頭から肩まで入る正方形)。画像からはみ出す場合は内側に寄せる */
export function viewRect(manifest: AvatarManifest): { x: number; y: number; size: number } {
  const faceHeight = manifest.chin.y - manifest.headTop.y;
  const size = Math.min(faceHeight * 1.9, manifest.width, manifest.height);
  const centerX = (manifest.headTop.x + manifest.chin.x) / 2;
  const centerY = (manifest.headTop.y + manifest.chin.y) / 2 + faceHeight * 0.28;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max);
  return {
    x: clamp(centerX - size / 2, manifest.width - size),
    y: clamp(centerY - size / 2, manifest.height - size),
    size,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
