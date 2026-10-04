/**
 * マイク入力(設計書 3.3)。AudioWorklet で 16kHz PCM にし、50 ミリ秒ごとに音声と音量を渡す。
 */
export const FRAME_MS = 50;
const FRAME_SIZE = (16000 * FRAME_MS) / 1000;

export type CaptureFrame = { pcm: Int16Array; rms: number; at: number };

export class AudioCapture {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;

  constructor(private readonly context: AudioContext) {}

  async start(onFrame: (frame: CaptureFrame) => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    await this.context.audioWorklet.addModule("/worklets/pcm-recorder.js");
    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, "pcm-recorder", {
      processorOptions: { targetRate: 16000, frameSize: FRAME_SIZE },
    });
    this.node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; rms: number }>) => {
      onFrame({ pcm: new Int16Array(event.data.pcm), rms: event.data.rms, at: performance.now() });
    };
    // 出力を音量0でつなぎ、ブラウザが処理を止めないようにする
    this.sink = this.context.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.context.destination);
  }

  stop() {
    this.node?.port.close();
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
