import type { SttClient, SttHandlers } from "./types";

type SpeechSdk = typeof import("microsoft-cognitiveservices-speech-sdk");

type TokenInfo = { token: string; region: string; expiresAt: number };

/**
 * Azure AI Speech の音声認識。サーバーが発行した一時トークンでブラウザから直接接続する(設計書 3.3)。
 * マイクの音声は AudioWorklet で 16kHz PCM にしたものを送る。
 */
export class AzureStt implements SttClient {
  readonly ownsMicrophone = false;
  private sdk: SpeechSdk | null = null;
  private recognizer: import("microsoft-cognitiveservices-speech-sdk").SpeechRecognizer | null = null;
  private pushStream: import("microsoft-cognitiveservices-speech-sdk").PushAudioInputStream | null = null;
  private paused = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly fetchToken: () => Promise<TokenInfo>,
    private readonly keywords: string[],
  ) {}

  async connect(handlers: SttHandlers): Promise<void> {
    const sdk = await import("microsoft-cognitiveservices-speech-sdk");
    this.sdk = sdk;
    const token = await this.fetchToken();

    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region);
    speechConfig.speechRecognitionLanguage = "ja-JP";
    // 文の区切りを細かくして、確定結果を早く受け取る(話し終わりの判定はブラウザ側で行う)
    speechConfig.setProperty(sdk.PropertyId.Speech_SegmentationSilenceTimeoutMs, "500");

    const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    this.pushStream = sdk.AudioInputStream.createPushStream(format);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromStreamInput(this.pushStream));

    if (this.keywords.length > 0) {
      const phrases = sdk.PhraseListGrammar.fromRecognizer(recognizer);
      for (const keyword of this.keywords) phrases.addPhrase(keyword);
    }

    recognizer.recognizing = (_sender, event) => handlers.onPartial(event.result.text);
    recognizer.recognized = (_sender, event) => {
      if (event.result.reason === sdk.ResultReason.RecognizedSpeech && event.result.text) {
        handlers.onFinal(event.result.text);
        handlers.onPartial("");
      }
    };
    recognizer.canceled = (_sender, event) => {
      if (event.reason === sdk.CancellationReason.Error) handlers.onError(`音声認識エラー: ${event.errorDetails}`);
    };

    this.recognizer = recognizer;
    await new Promise<void>((resolve, reject) => recognizer.startContinuousRecognitionAsync(resolve, (e) => reject(new Error(e))));
    this.scheduleRefresh(token.expiresAt);
  }

  sendAudio(frame: Int16Array): void {
    if (!this.pushStream) return;
    // 一時停止中は無音を送り、面接官の声などを認識させない
    const data = this.paused ? new Int16Array(frame.length) : frame;
    this.pushStream.write(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  close(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.pushStream?.close();
    const recognizer = this.recognizer;
    this.recognizer = null;
    recognizer?.stopContinuousRecognitionAsync(
      () => recognizer.close(),
      () => recognizer.close(),
    );
  }

  /** トークンの期限の1分前に再発行する */
  private scheduleRefresh(expiresAt: number) {
    const delay = Math.max(30_000, expiresAt - Date.now() - 60_000);
    this.refreshTimer = setTimeout(async () => {
      try {
        const next = await this.fetchToken();
        if (this.recognizer) this.recognizer.authorizationToken = next.token;
        this.scheduleRefresh(next.expiresAt);
      } catch {
        this.scheduleRefresh(Date.now() + 90_000);
      }
    }, delay);
  }
}
