/**
 * 音量による簡易的な発話検知。マイクの音量(50ミリ秒ごと)から、話しているかどうかを判定する。
 * 周囲の雑音の大きさを追いかけ、それより十分大きい音を声とみなす。
 */

export type VadParams = {
  /** 雑音レベルからこれだけ大きければ声とみなす(dB) */
  marginDb: number;
  /** 声とみなす最低限の音量(dBFS) */
  minDb: number;
  /** 話し始めとみなすまでに必要な、声の連続時間 */
  startMs: number;
  /** 話し終わりとみなすまでの、無音の連続時間 */
  hangoverMs: number;
};

export const DEFAULT_VAD_PARAMS: VadParams = { marginDb: 12, minDb: -50, startMs: 100, hangoverMs: 300 };

export type VadEvent = { type: "start"; at: number } | { type: "end"; at: number };

export class EnergyVad {
  private noiseDb = -60;
  private voicedRun = 0;
  private silentRun = 0;
  private speaking = false;
  private lastVoiceAt: number | null = null;
  private voiceMs = 0;

  constructor(private readonly params: VadParams = DEFAULT_VAD_PARAMS) {}

  /** rms(0〜1)と、そのフレームの長さ・時刻を渡す */
  process(rms: number, frameMs: number, at: number): VadEvent | null {
    const db = 20 * Math.log10(rms + 1e-9);
    const threshold = Math.max(this.noiseDb + this.params.marginDb, this.params.minDb);
    const voiced = db > threshold;

    // 雑音レベルは、下がるときはすぐ、上がるときはゆっくり追いかける。声と判定している間も
    // ごくゆっくり上げ、最初から大きな雑音がある部屋でも「ずっと話している」状態にならないようにする
    this.noiseDb = db < this.noiseDb ? db : this.noiseDb + (voiced ? 0.005 : 0.05) * (db - this.noiseDb);

    if (voiced) {
      this.voicedRun += frameMs;
      this.silentRun = 0;
      this.lastVoiceAt = at;
      if (this.speaking) this.voiceMs += frameMs;
      if (!this.speaking && this.voicedRun >= this.params.startMs) {
        this.speaking = true;
        this.voiceMs += this.voicedRun;
        return { type: "start", at: at - this.voicedRun + frameMs };
      }
    } else {
      this.voicedRun = 0;
      this.silentRun += frameMs;
      if (this.speaking && this.silentRun >= this.params.hangoverMs) {
        this.speaking = false;
        return { type: "end", at: this.lastVoiceAt ?? at };
      }
    }
    return null;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  get lastVoiceTime(): number | null {
    return this.lastVoiceAt;
  }

  get totalVoiceMs(): number {
    return this.voiceMs;
  }

  /** 1回の回答ごとに、合計時間などを数え直す */
  resetUtterance() {
    this.voiceMs = 0;
    this.lastVoiceAt = null;
    this.voicedRun = 0;
    this.silentRun = 0;
    this.speaking = false;
  }

  /** 0〜1 に正規化した音量(メーター表示用) */
  static level(rms: number): number {
    const db = 20 * Math.log10(rms + 1e-9);
    return Math.min(1, Math.max(0, (db + 60) / 50));
  }
}
