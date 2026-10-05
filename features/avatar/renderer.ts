import {
  expressionRegions,
  MOUTH_IMAGE_KEYS,
  type AvatarManifest,
  type Ellipse,
  type ExpressionImage,
  type MouthImageKey,
  type Rect,
} from "./manifest";
import { mouthFramesSchema, type MouthFrameBlend, type MouthFrames } from "./mouth-frames";
import type { MouthImageWeight } from "./mouth-images";
import { buildRig, type AvatarPose, type FaceRig } from "./rig";

/**
 * 顔画像を、口・まぶた・頭の動きに合わせて描く(設計書 3.12)。
 * 画面の各点が元画像のどこに当たるかを WebGL のシェーダーで計算する。
 * 表情違いの画像(口の形・目を閉じた顔)があれば、口元・目元にその画像をなめらかに重ねる。
 * 話している動画から作った口元のコマ(mouth-frames.ts)があれば、口元はそのコマを重ねる。
 * どちらもなければ元画像を変形し、開いた口の中(歯・舌)はシェーダーで描き足す。
 */

export interface AvatarSurface {
  /** 口やまばたきまで動かせるか(WebGL が使えない環境では頭の動きだけ) */
  readonly animated: boolean;
  /** 使える口の形の画像 */
  readonly mouthImageKeys: readonly MouthImageKey[];
  /** 使える口元のコマ(読み込めた場合) */
  readonly mouthFrames: MouthFrames | null;
  render(pose: AvatarPose): void;
  dispose(): void;
}

/** 少し拡大して表示し、頭を動かしたときの画像の端の引き伸ばしを隠す */
const ZOOM = 1.03;
const MAX_TEXTURE_SIZE = 1536;

export async function createAvatarSurface(canvas: HTMLCanvasElement, manifest: AvatarManifest): Promise<AvatarSurface> {
  const [image, expressions, frames] = await Promise.all([loadImage(manifest), loadExpressions(manifest), loadMouthFrames(manifest)]);
  const rig = buildRig(manifest);
  return WebGlSurface.create(canvas, image, rig, expressions, frames) ?? new CanvasSurface(canvas, image, rig);
}

/** 画像を読み込み、透明部分を白で埋めたキャンバスにする(大きすぎる画像は縮小する) */
async function loadImage(manifest: AvatarManifest): Promise<HTMLCanvasElement> {
  const img = await decodeImage(manifest.src);
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(manifest.width, manifest.height));
  return drawToCanvas(img, Math.round(manifest.width * scale), Math.round(manifest.height * scale));
}

/** 表情の画像のうち、元画像に重ねる範囲だけを切り出したもの */
type ExpressionTexture = { image: HTMLCanvasElement; rect: Rect };
type Expressions = {
  mouth: Map<MouthImageKey, ExpressionTexture>;
  blink: ExpressionTexture | null;
  mouthEllipse: Ellipse;
  eyeEllipses: Ellipse[];
};

/** 表情の画像を読み込む。読み込めない画像は使わず、その表情は元画像の変形で表す */
async function loadExpressions(manifest: AvatarManifest): Promise<Expressions> {
  const regions = expressionRegions(manifest);
  const load = async (expression: ExpressionImage | undefined, region: Rect) => {
    if (!expression) return null;
    try {
      return await loadExpression(expression, region, manifest);
    } catch (error) {
      console.warn("avatar expression image could not be loaded", error);
      return null;
    }
  };
  const mouth = new Map<MouthImageKey, ExpressionTexture>();
  await Promise.all(
    MOUTH_IMAGE_KEYS.map(async (key) => {
      const texture = await load(manifest.expressions?.mouth?.[key], regions.mouth.rect);
      if (texture) mouth.set(key, texture);
    }),
  );
  return {
    mouth,
    blink: await load(manifest.expressions?.blink, regions.eyes.rect),
    mouthEllipse: regions.mouth.ellipses[0],
    eyeEllipses: regions.eyes.ellipses,
  };
}

async function loadExpression(expression: ExpressionImage, region: Rect, manifest: AvatarManifest): Promise<ExpressionTexture> {
  const img = await decodeImage(expression.src);
  if (expression.rect) {
    // 位置を合わせて切り出し済みの画像
    return { image: drawToCanvas(img, img.naturalWidth, img.naturalHeight), rect: expression.rect };
  }
  // 元画像と同じ構図の画像:重ねる範囲だけを切り出す
  const sx = img.naturalWidth / manifest.width;
  const sy = img.naturalHeight / manifest.height;
  const canvas = drawToCanvas(null, region.width, region.height);
  canvas.getContext("2d")!.drawImage(img, region.x * sx, region.y * sy, region.width * sx, region.height * sy, 0, 0, region.width, region.height);
  return { image: canvas, rect: region };
}

/** 口元のコマと、それを並べた画像 */
type FrameAtlas = { data: MouthFrames; image: HTMLImageElement };

/** 口元のコマを読み込む。読み込めない場合は使わず、口は表情の画像(なければ元画像の変形)で表す */
async function loadMouthFrames(manifest: AvatarManifest): Promise<FrameAtlas | null> {
  if (!manifest.mouthFrames) return null;
  try {
    const response = await fetch(manifest.mouthFrames);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = mouthFramesSchema.parse(await response.json());
    const rows = Math.ceil(data.frames.length / data.columns);
    const image = await decodeImage(data.image);
    if (image.naturalWidth < data.columns * data.rect.width || image.naturalHeight < rows * data.rect.height) {
      throw new Error("コマを並べた画像の大きさが合いません");
    }
    return { data, image };
  } catch (error) {
    console.warn("avatar mouth frames could not be loaded", error);
    return null;
  }
}

async function decodeImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

/** 白で塗ったキャンバスに画像を描く(透明部分を白にする) */
function drawToCanvas(img: HTMLImageElement | null, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を読み込めませんでした");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (img) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// 座標はすべて元画像のピクセル単位(左上が原点、y は下向き)
const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform vec2 uImageSize;
uniform vec4 uView;
uniform float uZoom;
uniform float uRoll0;
uniform float uUnit;
uniform vec2 uEye0;
uniform vec2 uEyeHalf0;
uniform vec2 uEye1;
uniform vec2 uEyeHalf1;
uniform vec2 uMouth;
uniform float uMouthHalf;
uniform float uChin;
uniform vec2 uPivot;
uniform vec2 uHeadCenter;
uniform vec2 uHeadRadii;
uniform float uOpen;
uniform float uWide;
uniform float uBlink;
uniform float uHeadRoll;
uniform vec2 uHeadShift;
uniform float uNod;
uniform float uBreath;
uniform sampler2D uMouthTexA;
uniform sampler2D uMouthTexB;
uniform vec4 uMouthRectA;
uniform vec4 uMouthRectB;
uniform vec4 uMouthUvA;
uniform vec4 uMouthUvB;
uniform vec2 uMouthCut;
uniform float uMouthWA;
uniform float uMouthWB;
uniform vec4 uMouthEllipse;
uniform sampler2D uEyesTex;
uniform vec4 uEyesRect;
uniform float uEyesW;
uniform vec4 uEyeEllipse0;
uniform vec4 uEyeEllipse1;

vec2 rotate(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// 頭の動き:首を中心に回転・移動し、うなずきでは少し下がって縦に縮む。
// 動きは小さいので、逆変換は1次の近似で求める
vec2 headInverse(vec2 p) {
  float w = 1.0 - smoothstep(0.85, 1.3, length((p - uHeadCenter) / uHeadRadii));
  vec2 rel = p - uPivot;
  rel.y *= 1.0 - 0.04 * uNod;
  vec2 moved = uPivot + rotate(rel, uHeadRoll) + uHeadShift + vec2(0.0, 0.06 * uNod * uUnit);
  return p - w * (moved - p);
}

// まばたき:まぶたの上の皮膚を下へ伸ばして目を覆い、下まぶたを少し上げる
vec2 eyeInverse(vec2 q, vec2 center, vec2 halfSize, inout float lash) {
  if (uBlink <= 0.001) return q;
  vec2 e = rotate(q - center, -uRoll0) / halfSize;
  const float top = -2.0;
  const float bottom = 1.6;
  if (abs(e.x) >= 1.0 || e.y < top || e.y > bottom) return q;
  float env = pow(1.0 - e.x * e.x, 0.6);
  float closeLine = mix(-env, 0.3 * env, uBlink);
  float ys;
  if (e.y < closeLine) {
    ys = top + (e.y - top) * (-env - top) / (closeLine - top);
  } else {
    float from = mix(closeLine, env, uBlink);
    ys = from + (e.y - closeLine) * (bottom - from) / (bottom - closeLine);
  }
  float d = (e.y - closeLine) * halfSize.y / 1.8;
  lash = max(lash, smoothstep(0.2, 0.7, uBlink) * env * exp(-d * d));
  return center + rotate(vec2(e.x, ys) * halfSize, uRoll0);
}

float lipProfile(float u) {
  return pow(max(0.0, 1.0 - u * u), 0.75);
}

// 下唇とあごの下がる量(唇の合わせ目からの距離 v に応じて、口の形からあごの形へ変える)
float jawDrop(float u, float v, float drop, float chinV) {
  float vv = max(v, 0.0);
  float t = clamp(vv / chinV, 0.0, 1.0);
  float profile = mix(lipProfile(u), 1.0 - smoothstep(1.1, 2.4, abs(u)), t);
  float fall = 1.0 - smoothstep(chinV * 0.95, chinV * 1.7, vv);
  return drop * profile * fall;
}

// 口の開きと形。cavity は開いた口の中の割合、cavityColor はその色
vec2 mouthInverse(vec2 q, out float cavity, out vec3 cavityColor) {
  cavity = 0.0;
  cavityColor = vec3(0.0);
  vec2 l = rotate(q - uMouth, -uRoll0) / uMouthHalf;
  float widthScale = 1.0 + 0.14 * uWide;
  float region = 1.0 - smoothstep(0.7, 1.7, length(vec2(l.x / 1.5, l.y / 1.1)));
  vec2 m = vec2(mix(l.x, l.x / widthScale, region), l.y);

  float h = uOpen * 0.62;
  if (h > 0.002) {
    float chinV = uChin / uMouthHalf;
    float profile = lipProfile(m.x);
    float up = h * 0.22 * profile;
    float down = h * 0.78 * profile;
    float ys;
    if (l.y < 0.0) {
      ys = l.y + up * (1.0 - smoothstep(0.3, 0.9, -l.y));
    } else {
      ys = l.y;
      for (int i = 0; i < 3; i++) ys = l.y - jawDrop(m.x, ys, h * 0.78, chinV);
    }
    bool inside = (l.y < 0.0 && ys > 0.0) || (l.y >= 0.0 && ys < 0.0);
    if (inside && down + up > 0.0) {
      float y01 = clamp((l.y + up) / (down + up), 0.0, 1.0);
      float edgePx = min(l.y + up, down - l.y) * uMouthHalf;
      cavity = clamp(edgePx / 1.2, 0.0, 1.0);
      // 写真にもなじむよう、口の中は彩度を抑えた暗い色、歯は少しくすんだ白にする
      vec3 color = mix(vec3(0.22, 0.09, 0.09), vec3(0.07, 0.03, 0.035), smoothstep(0.0, 0.6, y01));
      float teethPx = 0.11 * uMouthHalf;
      float fromTop = (l.y + up) * uMouthHalf;
      float openPx = (down + up) * uMouthHalf;
      float teeth = (1.0 - smoothstep(teethPx - 1.0, teethPx, fromTop)) * (1.0 - smoothstep(0.45, 0.62, abs(m.x))) * smoothstep(5.0, 9.0, openPx);
      vec3 teethColor = vec3(0.86, 0.83, 0.78) * (1.0 - 0.45 * abs(m.x)) * (1.0 - 0.25 * clamp(fromTop / teethPx, 0.0, 1.0));
      color = mix(color, teethColor, teeth);
      float tongue = smoothstep(0.62, 0.92, y01) * (1.0 - smoothstep(0.35, 0.6, abs(m.x)));
      color = mix(color, vec3(0.50, 0.24, 0.25), tongue * 0.8);
      cavityColor = color;
      ys = 0.0;
    }
    m.y = ys;
  }
  return uMouth + rotate(m * uMouthHalf, uRoll0);
}

// 表情の画像を重ねる割合:楕円の内側60%は表情の画像そのもの、外側はなめらかに元画像へ戻す
float ellipseMask(vec2 q, vec4 e) {
  return 1.0 - smoothstep(0.6, 1.0, length((q - e.xy) / e.zw));
}

// uvRect は、テクスチャの中で使う範囲(コマを並べた画像なら1コマ分。端の外側の画素を混ぜないよう半画素内側を読む)
vec3 patchColor(sampler2D tex, vec4 rect, vec4 uvRect, vec2 q, vec3 fallback) {
  vec2 uv = (q - rect.xy) / rect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return fallback;
  uv = clamp(uv, 0.5 / rect.zw, 1.0 - 0.5 / rect.zw);
  return texture2D(tex, uvRect.xy + uv * uvRect.zw).rgb;
}

void main() {
  vec2 p = uView.xy + (vec2(0.5) + (vUv - vec2(0.5)) / uZoom) * uView.zw;
  p.y -= uBreath * 0.012 * uUnit;
  vec2 head = headInverse(p);
  vec2 q = head;
  float lash = 0.0;
  q = eyeInverse(q, uEye0, uEyeHalf0, lash);
  q = eyeInverse(q, uEye1, uEyeHalf1, lash);
  float cavity;
  vec3 cavityColor;
  vec2 s = mouthInverse(q, cavity, cavityColor);
  vec3 color = texture2D(uImage, s / uImageSize).rgb;
  color *= 1.0 - 0.55 * lash;
  color = mix(color, cavityColor, cavity);

  float mouthW = uMouthWA + uMouthWB;
  if (mouthW > 0.001) {
    // 口元のコマでは、あごより下(首・襟。体の動きは頭と違う)は重ねない
    float m = ellipseMask(head, uMouthEllipse) * (1.0 - smoothstep(uMouthCut.x - uMouthCut.y, uMouthCut.x + uMouthCut.y, head.y));
    if (m > 0.0) {
      vec3 mixed = color * (1.0 - mouthW)
        + patchColor(uMouthTexA, uMouthRectA, uMouthUvA, head, color) * uMouthWA
        + patchColor(uMouthTexB, uMouthRectB, uMouthUvB, head, color) * uMouthWB;
      color = mix(color, mixed, m);
    }
  }
  if (uEyesW > 0.001) {
    float m = max(ellipseMask(head, uEyeEllipse0), ellipseMask(head, uEyeEllipse1));
    if (m > 0.0) color = mix(color, patchColor(uEyesTex, uEyesRect, vec4(0.0, 0.0, 1.0, 1.0), head, color), m * uEyesW);
  }
  gl_FragColor = vec4(color, 1.0);
}`;

const UNIFORMS = [
  "uImage", "uImageSize", "uView", "uZoom", "uRoll0", "uUnit",
  "uEye0", "uEyeHalf0", "uEye1", "uEyeHalf1", "uMouth", "uMouthHalf", "uChin",
  "uPivot", "uHeadCenter", "uHeadRadii",
  "uOpen", "uWide", "uBlink", "uHeadRoll", "uHeadShift", "uNod", "uBreath",
  "uMouthTexA", "uMouthTexB", "uMouthRectA", "uMouthRectB", "uMouthUvA", "uMouthUvB", "uMouthCut", "uMouthWA", "uMouthWB", "uMouthEllipse",
  "uEyesTex", "uEyesRect", "uEyesW", "uEyeEllipse0", "uEyeEllipse1",
] as const;
type UniformName = (typeof UNIFORMS)[number];

type GpuResources = {
  program: WebGLProgram;
  shaders: WebGLShader[];
  buffer: WebGLBuffer | null;
  image: WebGLTexture | null;
  mouth: Map<MouthImageKey, WebGLTexture | null>;
  blink: WebGLTexture | null;
  frames: WebGLTexture | null;
};

/** 口の形の画像・口元のコマを割り当てるテクスチャの番号(0 は元画像、3 は目を閉じた画像) */
const MOUTH_UNITS = [1, 2] as const;
const EYES_UNIT = 3;
/** 口元のコマでは、あご先からこの割合(唇からあご先までの長さに対する)より下を重ねない */
const FRAME_CUT_BELOW_CHIN = 0.1;
const FRAME_CUT_FEATHER = 0.15;
/** シェーダーの mouthInverse で、uOpen = 1 のときにあご先が下がる量(口の幅の半分に対する割合) */
const JAW_DROP_PER_OPEN = 0.62 * 0.78;

class WebGlSurface implements AvatarSurface {
  readonly animated = true;
  readonly mouthImageKeys: readonly MouthImageKey[];
  readonly mouthFrames: MouthFrames | null;
  private gl: WebGLRenderingContext;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private resources: GpuResources | null = null;
  private lost = false;

  static create(canvas: HTMLCanvasElement, image: HTMLCanvasElement, rig: FaceRig, expressions: Expressions, frames: FrameAtlas | null): WebGlSurface | null {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    // コマを並べた画像が GPU で扱える大きさを超える場合は使わない
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const usable = frames && frames.image.naturalWidth <= maxSize && frames.image.naturalHeight <= maxSize ? frames : null;
    const surface = new WebGlSurface(canvas, gl, image, rig, expressions, usable);
    return surface.init() ? surface : null;
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    private readonly image: HTMLCanvasElement,
    private readonly rig: FaceRig,
    private readonly expressions: Expressions,
    private readonly frames: FrameAtlas | null,
  ) {
    this.gl = gl;
    this.mouthImageKeys = [...expressions.mouth.keys()];
    this.mouthFrames = frames?.data ?? null;
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
  }

  private onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };

  private onRestored = () => {
    this.lost = !this.init();
  };

  /** シェーダー・頂点・画像を GPU に用意する(描画の状態が失われたときもやり直す) */
  private init(): boolean {
    const gl = this.gl;
    const program = gl.createProgram();
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!program || !vertex || !fragment) return false;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("avatar shader link failed", gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const { mouth, blink, mouthEllipse, eyeEllipses } = this.expressions;
    const blinkTexture = blink ? createTexture(gl, EYES_UNIT, blink.image) : null;
    const mouthTextures = new Map([...mouth].map(([key, expression]) => [key, createTexture(gl, MOUTH_UNITS[0], expression.image)]));
    const framesTexture = this.frames ? createTexture(gl, MOUTH_UNITS[0], this.frames.image) : null;
    // 元画像は最後に作り、どのテクスチャ番号にも元画像を割り当てておく(使わない番号の読み込み先)
    const image = createTexture(gl, 0, this.image);
    for (const unit of [...MOUTH_UNITS, ...(blinkTexture ? [] : [EYES_UNIT])]) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, image);
    }
    if (blinkTexture) {
      gl.activeTexture(gl.TEXTURE0 + EYES_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, blinkTexture);
    }
    this.resources = { program, shaders: [vertex, fragment], buffer, image, mouth: mouthTextures, blink: blinkTexture, frames: framesTexture };

    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    const u = this.uniforms;
    const rig = this.rig;
    gl.uniform1i(u.uImage, 0);
    gl.uniform1i(u.uMouthTexA, MOUTH_UNITS[0]);
    gl.uniform1i(u.uMouthTexB, MOUTH_UNITS[1]);
    gl.uniform1i(u.uEyesTex, EYES_UNIT);
    gl.uniform4f(u.uMouthEllipse, mouthEllipse.cx, mouthEllipse.cy, mouthEllipse.rx, mouthEllipse.ry);
    gl.uniform4f(u.uEyeEllipse0, eyeEllipses[0].cx, eyeEllipses[0].cy, eyeEllipses[0].rx, eyeEllipses[0].ry);
    gl.uniform4f(u.uEyeEllipse1, eyeEllipses[1].cx, eyeEllipses[1].cy, eyeEllipses[1].rx, eyeEllipses[1].ry);
    if (blink) gl.uniform4f(u.uEyesRect, blink.rect.x, blink.rect.y, blink.rect.width, blink.rect.height);
    gl.uniform2f(u.uImageSize, rig.imageSize[0], rig.imageSize[1]);
    gl.uniform4f(u.uView, rig.view.x, rig.view.y, rig.view.width, rig.view.height);
    gl.uniform1f(u.uZoom, ZOOM);
    gl.uniform1f(u.uRoll0, rig.roll);
    gl.uniform1f(u.uUnit, rig.unit);
    gl.uniform2f(u.uEye0, rig.eyes[0].center.x, rig.eyes[0].center.y);
    gl.uniform2f(u.uEyeHalf0, rig.eyes[0].halfWidth, rig.eyes[0].halfHeight);
    gl.uniform2f(u.uEye1, rig.eyes[1].center.x, rig.eyes[1].center.y);
    gl.uniform2f(u.uEyeHalf1, rig.eyes[1].halfWidth, rig.eyes[1].halfHeight);
    gl.uniform2f(u.uMouth, rig.mouthCenter.x, rig.mouthCenter.y);
    gl.uniform1f(u.uMouthHalf, rig.mouthHalfWidth);
    gl.uniform1f(u.uChin, rig.chinDistance);
    gl.uniform2f(u.uPivot, rig.pivot.x, rig.pivot.y);
    gl.uniform2f(u.uHeadCenter, rig.headCenter.x, rig.headCenter.y);
    gl.uniform2f(u.uHeadRadii, rig.headRadii[0], rig.headRadii[1]);
    return true;
  }

  render(pose: AvatarPose) {
    if (this.lost || !this.resources) return;
    const gl = this.gl;
    const u = this.uniforms;
    const unit = this.rig.unit;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (pose.mouthFrames && this.frames && this.resources.frames) {
      this.bindFrames(pose.mouthFrames, this.frames.data, this.resources.frames);
    } else {
      // 表情の画像がある場合も、元画像の口を pose の値だけ開き、その上に画像を重ねる(重ね合わせの途中を自然に見せる)
      gl.uniform1f(u.uOpen, pose.mouthOpen);
      gl.uniform1f(u.uWide, pose.mouthWide);
      gl.uniform2f(u.uMouthCut, 1e5, 1);
      const usable = pose.mouthImages.filter((w) => this.resources!.mouth.has(w.key));
      this.bindMouth(0, usable[0]);
      this.bindMouth(1, usable[1]);
    }
    const blinkImage = this.resources.blink !== null;
    gl.uniform1f(u.uBlink, blinkImage ? 0 : pose.blink);
    gl.uniform1f(u.uEyesW, blinkImage ? pose.blink : 0);
    gl.uniform1f(u.uHeadRoll, pose.headRoll);
    gl.uniform2f(u.uHeadShift, pose.headX * unit, pose.headY * unit);
    gl.uniform1f(u.uNod, pose.nod);
    gl.uniform1f(u.uBreath, pose.breath);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** 口の形の画像を、A(slot 0)または B(slot 1)に割り当てる */
  private bindMouth(slot: 0 | 1, weight: MouthImageWeight | undefined) {
    const gl = this.gl;
    const u = this.uniforms;
    const resources = this.resources!;
    const expression = weight ? this.expressions.mouth.get(weight.key) : undefined;
    gl.activeTexture(gl.TEXTURE0 + MOUTH_UNITS[slot]);
    gl.bindTexture(gl.TEXTURE_2D, (weight && resources.mouth.get(weight.key)) || resources.image);
    gl.uniform1f(slot === 0 ? u.uMouthWA : u.uMouthWB, weight && expression ? weight.weight : 0);
    if (expression) {
      const { x, y, width, height } = expression.rect;
      gl.uniform4f(slot === 0 ? u.uMouthRectA : u.uMouthRectB, x, y, width, height);
      gl.uniform4f(slot === 0 ? u.uMouthUvA : u.uMouthUvB, 0, 0, 1, 1);
    }
  }

  /**
   * 口元のコマ from と to を、mix の割合で重ねる(全体の濃さは weight)。
   * 元画像のあごもコマと同じだけ下げ、重ねる範囲の縁(あごの下)でずれないようにする。
   */
  private bindFrames(blend: MouthFrameBlend, data: MouthFrames, texture: WebGLTexture) {
    const gl = this.gl;
    const u = this.uniforms;
    const { rect, columns } = data;
    const texWidth = this.frames!.image.naturalWidth;
    const texHeight = this.frames!.image.naturalHeight;
    const cell = (index: number): [number, number, number, number] => [
      ((index % columns) * rect.width) / texWidth,
      (Math.floor(index / columns) * rect.height) / texHeight,
      rect.width / texWidth,
      rect.height / texHeight,
    ];
    const rig = this.rig;
    const jaw = Math.max(0, blend.jaw) * blend.weight;
    gl.uniform1f(u.uOpen, clamp01(jaw / (JAW_DROP_PER_OPEN * rig.mouthHalfWidth)));
    gl.uniform1f(u.uWide, 0);
    const chinY = rig.mouthCenter.y + rig.chinDistance;
    gl.uniform2f(u.uMouthCut, chinY + jaw + rig.chinDistance * FRAME_CUT_BELOW_CHIN, rig.chinDistance * FRAME_CUT_FEATHER);
    for (const slot of [0, 1] as const) {
      const index = Math.min(slot === 0 ? blend.from : blend.to, data.frames.length - 1);
      gl.activeTexture(gl.TEXTURE0 + MOUTH_UNITS[slot]);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1f(slot === 0 ? u.uMouthWA : u.uMouthWB, (slot === 0 ? 1 - blend.mix : blend.mix) * blend.weight);
      gl.uniform4f(slot === 0 ? u.uMouthRectA : u.uMouthRectB, rect.x, rect.y, rect.width, rect.height);
      gl.uniform4f(slot === 0 ? u.uMouthUvA : u.uMouthUvB, ...cell(index));
    }
  }

  /** GPU の資源を解放する(同じキャンバスで別の画像を描き直せるよう、描画の状態そのものは残す) */
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    const resources = this.resources;
    this.resources = null;
    if (!resources || this.lost) return;
    gl.deleteTexture(resources.image);
    resources.mouth.forEach((texture) => gl.deleteTexture(texture));
    gl.deleteTexture(resources.blink);
    gl.deleteTexture(resources.frames);
    gl.deleteBuffer(resources.buffer);
    resources.shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(resources.program);
  }
}

/** 画像を GPU に送る(指定した番号のテクスチャとして割り当てたままにする) */
function createTexture(gl: WebGLRenderingContext, unit: number, source: HTMLCanvasElement | HTMLImageElement): WebGLTexture | null {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  return texture;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("avatar shader compile failed", gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}

/** WebGL が使えない環境用。画像全体を少し動かすだけで、口とまばたきは動かさない */
class CanvasSurface implements AvatarSurface {
  readonly animated = false;
  readonly mouthImageKeys: readonly MouthImageKey[] = [];
  readonly mouthFrames = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly image: HTMLCanvasElement,
    private readonly rig: FaceRig,
  ) {}

  render(pose: AvatarPose) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = this.canvas;
    const { view, pivot, unit, imageSize } = this.rig;
    const scale = (width / view.width) * ZOOM;
    const toTexture = this.image.width / imageSize[0];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(view.x + view.width / 2), -(view.y + view.height / 2) + pose.breath * 0.012 * unit);
    ctx.translate(pivot.x + pose.headX * unit, pivot.y + (pose.headY + 0.06 * pose.nod) * unit);
    ctx.rotate(pose.headRoll * 0.5);
    ctx.translate(-pivot.x, -pivot.y);
    ctx.drawImage(this.image, 0, 0, imageSize[0] * toTexture, imageSize[1] * toTexture, 0, 0, imageSize[0], imageSize[1]);
  }

  dispose() {}
}
