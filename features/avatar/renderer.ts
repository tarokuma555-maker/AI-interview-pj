import type { AvatarManifest } from "./manifest";
import { buildRig, type AvatarPose, type FaceRig } from "./rig";

/**
 * 顔画像1枚を、口・まぶた・頭の動きに合わせて変形して描く(設計書 3.12)。
 * 画面の各点が元画像のどこに当たるかを WebGL のシェーダーで計算する。
 * 開いた口の中(歯・舌)は画像にないため、シェーダーで描き足す。
 */

export interface AvatarSurface {
  /** 口やまばたきまで動かせるか(WebGL が使えない環境では頭の動きだけ) */
  readonly animated: boolean;
  render(pose: AvatarPose): void;
  dispose(): void;
}

/** 少し拡大して表示し、頭を動かしたときの画像の端の引き伸ばしを隠す */
const ZOOM = 1.03;
const MAX_TEXTURE_SIZE = 1536;

export async function createAvatarSurface(canvas: HTMLCanvasElement, manifest: AvatarManifest): Promise<AvatarSurface> {
  const image = await loadImage(manifest);
  const rig = buildRig(manifest);
  return WebGlSurface.create(canvas, image, rig) ?? new CanvasSurface(canvas, image, rig);
}

/** 画像を読み込み、透明部分を白で埋めたキャンバスにする(大きすぎる画像は縮小する) */
async function loadImage(manifest: AvatarManifest): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = manifest.src;
  await img.decode();
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(manifest.width, manifest.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(manifest.width * scale);
  canvas.height = Math.round(manifest.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を読み込めませんでした");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
uniform vec3 uView;
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
      vec3 color = mix(vec3(0.34, 0.11, 0.11), vec3(0.12, 0.035, 0.045), smoothstep(0.0, 0.5, y01));
      float teethPx = 0.13 * uMouthHalf;
      float fromTop = (l.y + up) * uMouthHalf;
      float openPx = (down + up) * uMouthHalf;
      float teeth = (1.0 - smoothstep(teethPx - 1.0, teethPx, fromTop)) * (1.0 - smoothstep(0.55, 0.7, abs(m.x))) * smoothstep(5.0, 9.0, openPx);
      color = mix(color, vec3(0.93, 0.91, 0.87) * (1.0 - 0.3 * abs(m.x)), teeth);
      float tongue = smoothstep(0.62, 0.92, y01) * (1.0 - smoothstep(0.35, 0.6, abs(m.x)));
      color = mix(color, vec3(0.62, 0.27, 0.28), tongue * 0.85);
      cavityColor = color;
      ys = 0.0;
    }
    m.y = ys;
  }
  return uMouth + rotate(m * uMouthHalf, uRoll0);
}

void main() {
  vec2 p = uView.xy + (vec2(0.5) + (vUv - vec2(0.5)) / uZoom) * uView.z;
  p.y -= uBreath * 0.012 * uUnit;
  vec2 q = headInverse(p);
  float lash = 0.0;
  q = eyeInverse(q, uEye0, uEyeHalf0, lash);
  q = eyeInverse(q, uEye1, uEyeHalf1, lash);
  float cavity;
  vec3 cavityColor;
  vec2 s = mouthInverse(q, cavity, cavityColor);
  vec3 color = texture2D(uImage, s / uImageSize).rgb;
  color *= 1.0 - 0.55 * lash;
  color = mix(color, cavityColor, cavity);
  gl_FragColor = vec4(color, 1.0);
}`;

const UNIFORMS = [
  "uImage", "uImageSize", "uView", "uZoom", "uRoll0", "uUnit",
  "uEye0", "uEyeHalf0", "uEye1", "uEyeHalf1", "uMouth", "uMouthHalf", "uChin",
  "uPivot", "uHeadCenter", "uHeadRadii",
  "uOpen", "uWide", "uBlink", "uHeadRoll", "uHeadShift", "uNod", "uBreath",
] as const;
type UniformName = (typeof UNIFORMS)[number];

class WebGlSurface implements AvatarSurface {
  readonly animated = true;
  private gl: WebGLRenderingContext;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private resources: { program: WebGLProgram; shaders: WebGLShader[]; buffer: WebGLBuffer | null; texture: WebGLTexture | null } | null = null;
  private lost = false;

  static create(canvas: HTMLCanvasElement, image: HTMLCanvasElement, rig: FaceRig): WebGlSurface | null {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) return null;
    const surface = new WebGlSurface(canvas, gl, image, rig);
    return surface.init() ? surface : null;
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    private readonly image: HTMLCanvasElement,
    private readonly rig: FaceRig,
  ) {
    this.gl = gl;
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
    this.resources = { program, shaders: [vertex, fragment], buffer: null, texture: null };

    const buffer = gl.createBuffer();
    this.resources.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    this.resources.texture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.image);

    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);
    const u = this.uniforms;
    const rig = this.rig;
    gl.uniform1i(u.uImage, 0);
    gl.uniform2f(u.uImageSize, rig.imageSize[0], rig.imageSize[1]);
    gl.uniform3f(u.uView, rig.view.x, rig.view.y, rig.view.size);
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
    if (this.lost) return;
    const gl = this.gl;
    const u = this.uniforms;
    const unit = this.rig.unit;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uOpen, pose.mouthOpen);
    gl.uniform1f(u.uWide, pose.mouthWide);
    gl.uniform1f(u.uBlink, pose.blink);
    gl.uniform1f(u.uHeadRoll, pose.headRoll);
    gl.uniform2f(u.uHeadShift, pose.headX * unit, pose.headY * unit);
    gl.uniform1f(u.uNod, pose.nod);
    gl.uniform1f(u.uBreath, pose.breath);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** GPU の資源を解放する(同じキャンバスで別の画像を描き直せるよう、描画の状態そのものは残す) */
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    const resources = this.resources;
    this.resources = null;
    if (!resources || this.lost) return;
    gl.deleteTexture(resources.texture);
    gl.deleteBuffer(resources.buffer);
    resources.shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(resources.program);
  }
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
    const scale = (width / view.size) * ZOOM;
    const toTexture = this.image.width / imageSize[0];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(view.x + view.size / 2), -(view.y + view.size / 2) + pose.breath * 0.012 * unit);
    ctx.translate(pivot.x + pose.headX * unit, pivot.y + (pose.headY + 0.06 * pose.nod) * unit);
    ctx.rotate(pose.headRoll * 0.5);
    ctx.translate(-pivot.x, -pivot.y);
    ctx.drawImage(this.image, 0, 0, imageSize[0] * toTexture, imageSize[1] * toTexture, 0, 0, imageSize[0], imageSize[1]);
  }

  dispose() {}
}
