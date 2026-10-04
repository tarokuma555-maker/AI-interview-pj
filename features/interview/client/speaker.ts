/**
 * 面接官の発言を順番に再生する(設計書 3.6)。
 * サーバーで合成した音声(MP3 / WAV)と、ブラウザ標準の読み上げ(speechSynthesis)の両方を扱う。
 */

/** index が 0 以上は面接官の発言の文番号、負の値は定型フレーズ */
type PlayItem = { index: number; run: (generation: number) => Promise<void> };

export type SpeakerEvents = {
  onStart: (index: number) => void;
  onIdle: () => void;
};

export class Speaker {
  private queue: PlayItem[] = [];
  private playing = false;
  private generation = 0;
  private stopCurrent: (() => void) | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly events: SpeakerEvents,
  ) {}

  /** ユーザー操作の中で呼び、スマホでも音声を再生できるようにする */
  unlock() {
    void this.context.resume();
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.speak(new SpeechSynthesisUtterance(""));
    }
  }

  enqueueAudio(index: number, data: ArrayBuffer) {
    const decoded = this.context.decodeAudioData(data.slice(0));
    decoded.catch(() => undefined); // 再生時に扱う
    this.push({ index, run: (generation) => this.playBuffer(decoded, generation) });
  }

  enqueueSpeech(index: number, text: string) {
    this.push({ index, run: () => this.speak(text) });
  }

  /** 音声がない文(音声合成の失敗など)。字幕だけ出して次へ進む */
  enqueueSilence(index: number) {
    this.push({ index, run: () => new Promise((resolve) => setTimeout(resolve, 300)) });
  }

  stop() {
    this.generation++;
    this.queue = [];
    this.stopCurrent?.();
    this.stopCurrent = null;
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.playing = false;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private push(item: PlayItem) {
    this.queue.push(item);
    if (!this.playing) void this.loop();
  }

  private async loop() {
    this.playing = true;
    const generation = this.generation;
    while (this.queue.length > 0 && generation === this.generation) {
      const item = this.queue.shift()!;
      this.events.onStart(item.index);
      try {
        await item.run(generation);
      } catch {
        // 1文の再生に失敗しても、次の文へ進む
      }
    }
    if (generation === this.generation) {
      this.playing = false;
      this.events.onIdle();
    }
  }

  private async playBuffer(decoded: Promise<AudioBuffer>, generation: number) {
    const buffer = await decoded;
    if (generation !== this.generation) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      this.stopCurrent = () => {
        try {
          source.stop();
        } catch {
          // すでに止まっている
        }
        resolve();
      };
      source.start();
    });
    this.stopCurrent = null;
  }

  private speak(text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      this.stopCurrent = () => {
        speechSynthesis.cancel();
        resolve();
      };
      speechSynthesis.speak(utterance);
    });
  }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
