import { DEFAULT_VAD_PARAMS, EnergyVad } from "../vad";
import type { SttClient, SttHandlers } from "./types";

/**
 * Google Cloud の音声認識(サーバー経由。設計書 14.1)。ブラウザ標準の音声認識と違い、Safari やスマホでも同じように使える。
 * マイクの音声(16kHz PCM)を話の区切り(短い間)ごとに切り、区切りごとにサーバーへ送って文字にする。
 * 文字にしている間に、話し終わりの判定(間の長さを見る)が進むため、待ち時間はほとんど増えない。
 * 区切りの途中の文字(途中結果)は出ない。
 */

const SAMPLE_RATE = 16000;
/** この長さの間があれば、そこで区切って文字にし始める */
const SEGMENT_PAUSE_MS = 500;
/** 話し始めの取りこぼしを防ぐため、声を検知する前の音も少し含める */
const PRE_ROLL_MS = 300;
/** 1回に送る長さの上限(サーバーの上限 55 秒より短く) */
const MAX_SEGMENT_MS = 45_000;
/** これより短い区切りは、咳などの雑音とみなして送らない */
const MIN_SEGMENT_MS = 400;
/** 一時的な失敗がこの回数続いたら、使えないとみなす */
const MAX_FAILURES = 3;

type RecognizeError = Error & { code?: string };

export class GoogleCloudStt implements SttClient {
  readonly ownsMicrophone = false;
  private handlers: SttHandlers | null = null;
  private readonly vad = new EnergyVad({ ...DEFAULT_VAD_PARAMS, hangoverMs: SEGMENT_PAUSE_MS });
  private paused = false;
  private closed = false;
  private preRoll: Int16Array[] = [];
  private segment: Int16Array[] | null = null;
  private segmentMs = 0;
  private pending = new Set<Promise<void>>();
  /** 一時停止のたびに増やし、それより前の音声の結果が遅れて届いても使わない */
  private generation = 0;
  private failures = 0;

  constructor(
    private readonly recognize: (pcm: Int16Array, keywords: string[]) => Promise<string>,
    private readonly keywords: string[],
  ) {}

  /** 面接の前に、ごく短い無音を送って使えるかを確かめる(API が有効になっていない場合などに、先に知らせる) */
  async connect(handlers: SttHandlers): Promise<void> {
    this.handlers = handlers;
    try {
      await this.recognize(new Int16Array(SAMPLE_RATE / 10), []);
    } catch (error) {
      const code = (error as RecognizeError).code;
      if (code === "STT_UNAVAILABLE" || code === "INVALID_CODE") {
        this.close();
        handlers.onError((error as Error).message, true);
      }
      // 一時的な失敗なら、面接中にもう一度試す
    }
  }

  sendAudio(frame: Int16Array): void {
    if (this.paused || this.closed) return;
    const frameMs = (frame.length / SAMPLE_RATE) * 1000;
    const event = this.vad.process(rms(frame), frameMs, performance.now());
    if (!this.segment) {
      this.preRoll.push(frame);
      if (this.preRoll.length * frameMs > PRE_ROLL_MS) this.preRoll.shift();
      if (event?.type === "start") {
        this.segment = this.preRoll;
        this.segmentMs = this.preRoll.length * frameMs;
        this.preRoll = [];
      }
      return;
    }
    this.segment.push(frame);
    this.segmentMs += frameMs;
    if (event?.type === "end") this.endSegment();
    else if (this.segmentMs >= MAX_SEGMENT_MS) {
      // 長く話し続けている場合は、話の途中でも区切って送る(続きは次の区切りになる)
      this.endSegment();
      this.segment = [];
      this.segmentMs = 0;
    }
  }

  async flush(): Promise<void> {
    this.endSegment();
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }

  pause(): void {
    this.paused = true;
    this.generation++;
    this.reset();
  }

  resume(): void {
    this.paused = false;
    this.reset();
  }

  close(): void {
    this.closed = true;
    this.pause();
  }

  private reset() {
    this.segment = null;
    this.segmentMs = 0;
    this.preRoll = [];
    this.vad.resetUtterance();
  }

  private endSegment() {
    const segment = this.segment;
    const ms = this.segmentMs;
    this.segment = null;
    this.segmentMs = 0;
    if (!segment || ms < MIN_SEGMENT_MS) return;
    const pcm = concat(segment);
    const generation = this.generation;
    const task = this.recognize(pcm, this.keywords)
      .then((text) => {
        this.failures = 0;
        if (generation === this.generation && text && !this.closed) this.handlers?.onFinal(text);
      })
      .catch((error: RecognizeError) => this.onFailure(error))
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  private onFailure(error: RecognizeError) {
    if (this.closed) return;
    this.failures++;
    const unavailable = error.code === "STT_UNAVAILABLE" || error.code === "INVALID_CODE";
    if (unavailable || this.failures >= MAX_FAILURES) {
      this.close();
      this.handlers?.onError(
        unavailable ? error.message : "音声認識のサーバーとの通信に続けて失敗しました。通信環境を確認するか、文字で回答してください",
        true,
      );
      return;
    }
    this.handlers?.onError("音声を文字にできませんでした。もう一度お話しください");
  }
}

function rms(frame: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += (frame[i] / 32768) ** 2;
  return Math.sqrt(sum / Math.max(1, frame.length));
}

function concat(frames: Int16Array[]): Int16Array {
  const out = new Int16Array(frames.reduce((n, f) => n + f.length, 0));
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}
