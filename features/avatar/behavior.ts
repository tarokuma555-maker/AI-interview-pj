import { approach, type MouthShape, type VoiceState } from "./lip-sync";
import type { AvatarPose } from "./rig";

/**
 * 口以外の自然な動き(まばたき・呼吸・頭のゆれ・うなずき)を作る(設計書 3.12)。
 * 時刻と状態だけから決まるため、乱数を差し替えればテストで再現できる。
 */

export type AvatarMode = "idle" | "speaking" | "listening" | "thinking";

/** 画面から毎フレーム渡す、面接の状態 */
export type AvatarInputs = {
  mode: AvatarMode;
  voice: VoiceState;
  /** 求職者が声を出しているか */
  candidateVoice: boolean;
};

export type BehaviorInput = {
  mode: AvatarMode;
  mouth: MouthShape;
  /** 求職者が声を出しているか(相づちのうなずきに使う) */
  candidateVoice: boolean;
};

const BLINK_CLOSE_MS = 70;
const BLINK_HOLD_MS = 30;
const BLINK_OPEN_MS = 100;
const BLINK_MS = BLINK_CLOSE_MS + BLINK_HOLD_MS + BLINK_OPEN_MS;
const DOUBLE_BLINK_GAP_MS = 80;

const NOD_MS = 650;
/** 求職者がこの長さ以上話してから区切ったら、うなずく */
const NOD_AFTER_VOICE_MS = 1200;
const NOD_COOLDOWN_MS = 2500;

export class AvatarBehavior {
  private lastAt: number | null = null;
  private nextBlinkAt: number | null = null;
  private blinkAt: number | null = null;
  private doubleBlink = false;
  private nodAt: number | null = null;
  private nodStrength = 1;
  private nextNodAllowedAt = 0;
  private voiceSince: number | null = null;
  private previousMode: AvatarMode = "idle";
  private tilt = 0;
  private energy = 0;

  constructor(private readonly random: () => number = Math.random) {}

  update(now: number, input: BehaviorInput): AvatarPose {
    const dt = this.lastAt === null ? 0 : now - this.lastAt;
    this.lastAt = now;

    this.updateNodTriggers(now, input);
    this.previousMode = input.mode;

    this.tilt = approach(this.tilt, input.mode === "thinking" ? 1 : 0, dt, 600);
    this.energy = approach(this.energy, input.mode === "speaking" ? input.mouth.open : 0, dt, 250);

    const s = now / 1000;
    const wave = (periodSec: number, phase = 0) => Math.sin((2 * Math.PI * s) / periodSec + phase);
    return {
      mouthOpen: input.mouth.open,
      mouthWide: input.mouth.wide,
      blink: this.blink(now),
      headRoll: 0.012 * wave(5.3) + 0.006 * wave(2.9, 1.3) + 0.012 * this.energy * wave(1.7, 0.5) + 0.03 * this.tilt,
      headX: 0.012 * wave(6.1, 0.4) + 0.008 * this.energy * wave(2.3, 2),
      headY: 0.006 * wave(4.7, 2.1) + 0.012 * this.energy + 0.01 * this.tilt,
      nod: this.nod(now),
      breath: wave(4.2),
    };
  }

  private updateNodTriggers(now: number, input: BehaviorInput) {
    // 回答が終わって考え始めたときに、受け止めのうなずきを1回
    if (input.mode === "thinking" && this.previousMode === "listening") this.startNod(now, 1, true);
    if (input.mode !== "listening") {
      this.voiceSince = null;
      return;
    }
    if (input.candidateVoice) {
      this.voiceSince ??= now;
    } else if (this.voiceSince !== null) {
      // 話の区切り(息継ぎ)で相づちのうなずき
      if (now - this.voiceSince >= NOD_AFTER_VOICE_MS) this.startNod(now, 0.6, false);
      this.voiceSince = null;
    }
  }

  private startNod(now: number, strength: number, force: boolean) {
    if (!force && now < this.nextNodAllowedAt) return;
    if (this.nodAt !== null && now - this.nodAt < NOD_MS) return;
    this.nodAt = now;
    this.nodStrength = strength;
    this.nextNodAllowedAt = now + NOD_COOLDOWN_MS + this.random() * 1500;
  }

  private nod(now: number): number {
    if (this.nodAt === null) return 0;
    const t = (now - this.nodAt) / NOD_MS;
    if (t >= 1) {
      this.nodAt = null;
      return 0;
    }
    return this.nodStrength * Math.sin(Math.PI * t) ** 2;
  }

  private blink(now: number): number {
    if (this.nextBlinkAt === null) this.nextBlinkAt = now + 800 + this.random() * 2500;
    if (now >= this.nextBlinkAt) {
      this.blinkAt = now;
      this.doubleBlink = this.random() < 0.15;
      this.nextBlinkAt = now + 2200 + this.random() * 3800;
    }
    if (this.blinkAt === null) return 0;
    const elapsed = now - this.blinkAt;
    const second = this.doubleBlink ? elapsed - BLINK_MS - DOUBLE_BLINK_GAP_MS : -1;
    return Math.max(blinkCurve(elapsed), second >= 0 ? blinkCurve(second) : 0);
  }
}

/** まぶたの動き:素早く閉じて、少しゆっくり開く */
export function blinkCurve(elapsedMs: number): number {
  if (elapsedMs < 0 || elapsedMs >= BLINK_MS) return 0;
  if (elapsedMs < BLINK_CLOSE_MS) return easeInOut(elapsedMs / BLINK_CLOSE_MS);
  if (elapsedMs < BLINK_CLOSE_MS + BLINK_HOLD_MS) return 1;
  return 1 - easeInOut((elapsedMs - BLINK_CLOSE_MS - BLINK_HOLD_MS) / BLINK_OPEN_MS);
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
