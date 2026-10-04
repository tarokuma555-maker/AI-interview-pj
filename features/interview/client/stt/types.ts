/**
 * 音声認識のアダプター(設計書 3.3)。サービスごとの違いをこのインターフェースで吸収する。
 */
export type SttHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
};

export interface SttClient {
  /** マイクの音声を自分で取得するか(ブラウザ標準の音声認識は自分で取得する) */
  readonly ownsMicrophone: boolean;
  connect(handlers: SttHandlers): Promise<void>;
  /** 16kHz・16bit・モノラルの PCM を送る(ownsMicrophone が false の場合) */
  sendAudio(frame: Int16Array): void;
  /** 面接官の発話中など、認識を一時的に止める */
  pause(): void;
  resume(): void;
  close(): void;
}
