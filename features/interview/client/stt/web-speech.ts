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

/** Brave は音声認識の機能があるように見えるが、認識のサーバーにつながらず必ず失敗する */
export function isWebSpeechSupported(): boolean {
  return typeof window !== "undefined" && getCtor() !== null && !("brave" in navigator);
}

/** すぐに使えないと分かるエラーと、そのときの案内 */
const FATAL_ERRORS: Record<string, string> = {
  "not-allowed": "マイクの使用が許可されていないため、音声認識を使えません。ブラウザの設定でマイクを許可してから開き直すか、文字で回答してください",
  "service-not-allowed": "このブラウザでは音声認識が許可されていません(Safari では Siri と音声入力をオンにする必要があります)。Google Chrome か Microsoft Edge で開き直すか、文字で回答してください",
  "audio-capture": "マイクが見つからないため、音声認識を使えません。マイクをつないでから開き直すか、文字で回答してください",
  "language-not-supported": "このブラウザの音声認識は日本語に対応していません。Google Chrome か Microsoft Edge で開き直すか、文字で回答してください",
};
const NETWORK_MESSAGE =
  "このブラウザから音声認識のサーバーに接続できません。Google Chrome か Microsoft Edge で開き直すか、文字で回答してください(Brave などのブラウザや、社内ネットワーク・VPN では使えないことがあります)";
/** 接続の失敗がこの回数続いたら(途中で一度も認識できなければ)、使えないとみなす */
const MAX_NETWORK_FAILURES = 3;
const RETRY_DELAY_MS = 500;

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
  private networkFailures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  async connect(handlers: SttHandlers): Promise<void> {
    const Ctor = getCtor();
    if (!Ctor) throw new Error("このブラウザは音声認識(Web Speech API)に対応していません");
    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      this.networkFailures = 0;
      let partial = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) handlers.onFinal(result[0].transcript);
        else partial += result[0].transcript;
      }
      handlers.onPartial(partial);
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      const fatal = FATAL_ERRORS[event.error];
      if (fatal) return this.fail(handlers, fatal);
      if (event.error === "network") {
        this.networkFailures++;
        // 一時的な失敗かもしれないため、続けて失敗するまでは知らせずにつなぎ直す
        if (this.networkFailures >= MAX_NETWORK_FAILURES) this.fail(handlers, NETWORK_MESSAGE);
        return;
      }
      handlers.onError(`音声認識エラー: ${event.error}`);
    };
    recognition.onend = () => {
      this.running = false;
      // 無音が続くと自動で止まるので、使用中なら再開する(接続に失敗した直後は少し待つ)
      if (!this.wanted || this.closed) return;
      if (this.networkFailures > 0) this.retryTimer = setTimeout(() => this.wanted && this.startRecognition(), RETRY_DELAY_MS);
      else this.startRecognition();
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
    clearTimeout(this.retryTimer);
    this.recognition?.abort();
  }

  /** 使えないと分かったら、再開をやめて知らせる */
  private fail(handlers: SttHandlers, message: string) {
    this.close();
    handlers.onError(message, true);
  }

  private startRecognition() {
    if (this.running || this.closed || !this.recognition) return;
    try {
      this.recognition.start();
      this.running = true;
    } catch {
      // すでに開始中の場合は無視する
    }
  }
}
