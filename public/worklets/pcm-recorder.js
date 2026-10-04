/**
 * マイクの音声を 16kHz・16bit・モノラルの PCM に変換し、一定の長さ(初期値 50 ミリ秒)ごとに
 * 音量(RMS)と一緒にメインスレッドへ送る AudioWorklet。
 * 間引きの前に区間の平均を取ることで、簡易的に折り返し雑音を抑える。
 */
class PcmRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 16000;
    this.frameSize = opts.frameSize || 800;
    this.ratio = sampleRate / this.targetRate;
    this.phase = 0;
    this.acc = 0;
    this.count = 0;
    this.buffer = new Int16Array(this.frameSize);
    this.index = 0;
    this.sumSquares = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.acc += channel[i];
      this.count++;
      this.phase += 1;
      if (this.phase >= this.ratio) {
        this.phase -= this.ratio;
        this.push(this.acc / this.count);
        this.acc = 0;
        this.count = 0;
      }
    }
    return true;
  }

  push(value) {
    const v = Math.max(-1, Math.min(1, value));
    this.buffer[this.index++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    this.sumSquares += v * v;
    if (this.index === this.frameSize) {
      const rms = Math.sqrt(this.sumSquares / this.frameSize);
      this.port.postMessage({ pcm: this.buffer.buffer, rms }, [this.buffer.buffer]);
      this.buffer = new Int16Array(this.frameSize);
      this.index = 0;
      this.sumSquares = 0;
    }
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
