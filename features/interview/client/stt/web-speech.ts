import type { SttClient, SttHandlers } from "./types";

/**
 * ブラウザ標準の音声認識(Web Speech API)。設定不要で試せるが、対応ブラウザや
 * 音声の送信先(ブラウザの提供元)を選べないため、本番の採用候補ではなく比較の基準として使う。
 */

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function isWebSpeechSupported(): boolean {
  return typeof window !== "undefined" && getCtor() !== null;
}

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class WebSpeechStt implements SttClient {
  readonly ownsMicrophone = true;
  private recognition: SpeechRecognitionLike | null = null;
  private running = false;
  private wanted = false;
  private closed = false;

  async connect(handlers: SttHandlers): Promise<void> {
    const Ctor = getCtor();
    if (!Ctor) throw new Error("このブラウザは音声認識(Web Speech API)に対応していません");
    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) handlers.onFinal(result[0].transcript);
        else partial += result[0].transcript;
      }
      handlers.onPartial(partial);
    };
    recognition.onerror = (event) => {
      if (event.error !== "no-speech" && event.error !== "aborted") handlers.onError(`音声認識エラー: ${event.error}`);
    };
    recognition.onend = () => {
      this.running = false;
      // 無音が続くと自動で止まるので、使用中なら再開する
      if (this.wanted && !this.closed) this.startRecognition();
    };
    this.recognition = recognition;
    this.wanted = true;
    this.startRecognition();
  }

  sendAudio(): void {}

  pause(): void {
    this.wanted = false;
    if (this.running) this.recognition?.stop();
  }

  resume(): void {
    this.wanted = true;
    this.startRecognition();
  }

  close(): void {
    this.closed = true;
    this.wanted = false;
    this.recognition?.abort();
  }

  private startRecognition() {
    if (this.running || !this.recognition) return;
    try {
      this.recognition.start();
      this.running = true;
    } catch {
      // すでに開始中の場合は無視する
    }
  }
}
