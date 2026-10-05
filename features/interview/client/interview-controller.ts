import type { AvatarInputs, AvatarMode } from "@/features/avatar/behavior";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import {
  INITIAL_SESSION_STATE,
  type CandidateContext,
  type Phase,
  type SessionSettings,
  type SessionState,
  type TurnEvent,
  type TurnRecord,
} from "@/lib/interview/types";
import { INTERVIEW_PHRASES, MEDICAL_PHRASES } from "@/lib/speech/phrases";
import type { SttProvider, TtsProvider, VoiceGender } from "@/lib/speech/voices";
import { AudioCapture, FRAME_MS, type CaptureFrame } from "./audio-capture";
import { summarize, type LatencyRecord } from "./latency";
import {
  ApiError,
  fetchPhraseAudio,
  fetchFeedback,
  fetchPlan,
  fetchSttToken,
  recognizeSpeech,
  type FeedbackResult,
  postTurn,
  type TurnRequestBody,
} from "./poc-api";
import { base64ToArrayBuffer, Speaker } from "./speaker";
import { AzureStt } from "./stt/azure";
import { GoogleCloudStt } from "./stt/google";
import type { SttClient } from "./stt/types";
import { WebSpeechStt } from "./stt/web-speech";
import { decideTurnEnd, paramsForStyle, type TurnDetectorParams } from "./turn-detector";
import { EnergyVad } from "./vad";

/**
 * 面接ルームの状態管理(設計書 3.2)。画面はこのクラスの状態(Snapshot)を表示するだけにする。
 */

export type RoomStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "speaking"
  | "listening"
  | "answering"
  | "waiting"
  | "finished"
  | "error";

export type ControllerConfig = {
  accessCode: string;
  settings: SessionSettings;
  context: CandidateContext;
  sttProvider: SttProvider;
  ttsProvider: TtsProvider;
  /** イヤホンを使用中なら全二重(割り込み可)、そうでなければ半二重(設計書 3.7) */
  earphones: boolean;
  /** ブラウザ標準の読み上げで優先する声の性別(アバターに合わせる) */
  voiceGender?: VoiceGender;
};

export type Snapshot = {
  status: RoomStatus;
  message: string | null;
  plan: QuestionPlan | null;
  history: TurnRecord[];
  phase: Phase;
  remainingSec: number | null;
  interviewerCaption: string;
  candidateCaption: string;
  micLevel: number;
  latencies: LatencyRecord[];
  echoTest: { deltaDb: number; echoLikely: boolean } | null;
  /** マイクを使わずテキストで回答するモード */
  textMode: boolean;
  /** 音声認識が使えなくなり、途中から文字での回答に切り替えた理由 */
  sttFallback: string | null;
  /** 面接後の評価・フィードバック(設計書 4.6) */
  feedback: FeedbackState;
};

export type FeedbackState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "done"; result: FeedbackResult }
  | { status: "failed"; message: string }
  | { status: "no_answers" };

export const PHRASES = {
  wait: "少々お待ちください。",
  encourage: "ゆっくりで大丈夫ですよ。考えがまとまったらお話しください。",
  retry: "申し訳ありません。少し通信が不安定なようです。もう一度お願いできますか。",
  echo: "これはスピーカーのテストです。マイクがこの声を拾うかを確認しています。",
} as const;
type PhraseKey = keyof typeof PHRASES;

/** 定型フレーズの再生に使う番号(面接官の文番号と区別するため負の値) */
const PHRASE_INDEX = -1;
const WAIT_PHRASE_AFTER_MS = 3000;
const ENCOURAGE_AFTER_MS = 15_000;
const BARGE_IN_MS = 400;
const HALF_DUPLEX_TAIL_MS = 300;
/** 話し終わりを確定する前に、音声認識の結果を待つ上限 */
const STT_FLUSH_TIMEOUT_MS = 8000;

type DoneEvent = Extract<TurnEvent, { type: "done" }>;

type ActiveTurn = {
  abort: AbortController;
  reason: string;
  sentences: string[];
  played: number;
  appended: TurnRecord[];
  ackState: SessionState | null;
  done: DoneEvent | null;
  committed: boolean;
  firstStarted: boolean;
  /** 最後の声(話し終わり)の時刻 */
  t0: number | null;
  /** 回答を送った時刻 */
  t1: number;
  /** 面接官の声が聞こえ始めた時刻 */
  t4: number | null;
};

type AnswerState = {
  finals: string[];
  partial: string;
  lastPartialAt: number | null;
  speechStartedAt: number | null;
  responseDelayMs: number | undefined;
  interviewerEndedAt: number | null;
  manualEnd: boolean;
  encouraged: boolean;
  bargeStartAt: number | null;
  finalizing: boolean;
};

function freshAnswer(): AnswerState {
  return {
    finals: [],
    partial: "",
    lastPartialAt: null,
    speechStartedAt: null,
    responseDelayMs: undefined,
    interviewerEndedAt: null,
    manualEnd: false,
    encouraged: false,
    bargeStartAt: null,
    finalizing: false,
  };
}

const INITIAL_SNAPSHOT: Snapshot = {
  status: "idle",
  message: null,
  plan: null,
  history: [],
  phase: "opening",
  remainingSec: null,
  interviewerCaption: "",
  candidateCaption: "",
  micLevel: 0,
  latencies: [],
  echoTest: null,
  textMode: false,
  sttFallback: null,
  feedback: { status: "none" },
};

const AVATAR_MODES: Record<RoomStatus, AvatarMode> = {
  idle: "idle",
  preparing: "idle",
  ready: "idle",
  speaking: "speaking",
  listening: "listening",
  answering: "listening",
  waiting: "thinking",
  finished: "idle",
  error: "idle",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください";
  }
  return error instanceof Error ? error.message : "エラーが発生しました";
}

export class InterviewController {
  private snapshot: Snapshot = INITIAL_SNAPSHOT;
  private listeners = new Set<() => void>();

  private config: ControllerConfig | null = null;
  private context: AudioContext | null = null;
  private capture: AudioCapture | null = null;
  private stt: SttClient | null = null;
  private speaker: Speaker | null = null;
  private vad = new EnergyVad();
  private params: TurnDetectorParams = paramsForStyle("standard");
  private plan: QuestionPlan | null = null;
  private history: TurnRecord[] = [];
  private state: SessionState = INITIAL_SESSION_STATE;
  private phrases = new Map<PhraseKey, ArrayBuffer>();
  private turn: ActiveTurn | null = null;
  private previous: TurnRequestBody["previous"];
  private answer: AnswerState = freshAnswer();
  private listenAfter = 0;
  private lastLevelAt = 0;
  private turnCount = 0;
  private echoSamples: number[] | null = null;
  private timers: { detector?: ReturnType<typeof setInterval>; countdown?: ReturnType<typeof setInterval>; silence?: ReturnType<typeof setTimeout>; wait?: ReturnType<typeof setTimeout> } = {};

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  /** アバターの動きに使う状態(画面の描画のたびに呼ばれる) */
  avatarInputs = (): AvatarInputs => {
    const mode = AVATAR_MODES[this.snapshot.status];
    return {
      mode,
      voice: this.speaker?.voiceState ?? { kind: "none" },
      candidateVoice: mode === "listening" && this.vad.isSpeaking,
    };
  };

  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private get fullDuplex(): boolean {
    return this.config?.earphones ?? false;
  }

  private get usesVoice(): boolean {
    return this.config?.sttProvider !== "text";
  }

  // ---- 準備 ----------------------------------------------------------------

  /** 機器の準備と質問計画の生成(ボタン操作の中で呼ぶ) */
  async prepare(config: ControllerConfig) {
    this.config = config;
    this.params = paramsForStyle(config.settings.style);
    this.update({ status: "preparing", message: "マイクを準備しています…", textMode: config.sttProvider === "text", sttFallback: null });
    try {
      this.context = new AudioContext();
      this.speaker = new Speaker(
        this.context,
        { onStart: (index) => this.onSpeakerStart(index), onIdle: () => this.onSpeakerIdle() },
        { gender: config.voiceGender, pitch: config.settings.voicePitch, rate: config.settings.voiceRate },
      );
      if (this.usesVoice) {
        this.capture = new AudioCapture(this.context);
        await this.capture.start((frame) => this.onFrame(frame));
      }

      this.update({ message: "質問を準備しています…" });
      this.plan = await fetchPlan(config.accessCode, config.settings, config.context);

      if (config.sttProvider === "webspeech") this.stt = new WebSpeechStt();
      if (config.sttProvider === "google") {
        const keywords = this.plan.stt_keywords.filter((k) => k.length <= 100).slice(0, 50);
        this.stt = new GoogleCloudStt((pcm, words) => recognizeSpeech(config.accessCode, pcm, words), keywords);
      }
      if (config.sttProvider === "azure") {
        this.stt = new AzureStt(() => fetchSttToken(config.accessCode), [...this.plan.stt_keywords, ...INTERVIEW_PHRASES, ...MEDICAL_PHRASES]);
      }
      if (this.stt) {
        this.update({ message: "音声認識を準備しています…" });
        await this.stt.connect({
          onPartial: (text) => this.onPartial(text),
          onFinal: (text) => this.onFinal(text),
          onError: (message, fatal) => (fatal ? this.fallBackToText(message) : this.update({ message })),
        });
        // 準備中に使えないと分かった場合は、文字での回答に切り替わっている(this.stt は null)
        this.stt?.pause();
      }

      await this.loadPhrases();
      this.update({ status: "ready", plan: this.plan, message: null });
    } catch (error) {
      this.update({ status: "error", message: errorMessage(error) });
    }
  }

  private async loadPhrases() {
    const provider = this.config?.ttsProvider;
    if (!provider || provider === "browser") return;
    const { accessCode, settings } = this.config!;
    const voice = { id: settings.voiceId, pitch: settings.voicePitch, rate: settings.voiceRate };
    await Promise.all(
      (Object.keys(PHRASES) as PhraseKey[]).map(async (key) => {
        this.phrases.set(key, await fetchPhraseAudio(accessCode, PHRASES[key], voice, provider));
      }),
    );
  }

  /** スピーカーの音をマイクが拾うか(エコー)を確かめる(設計書 3.7) */
  async runEchoTest() {
    if (!this.capture || !this.speaker || this.snapshot.status !== "ready") return;
    this.speaker.unlock();
    this.echoSamples = [];
    await sleep(1000);
    const baseline = averageDb(this.echoSamples);
    this.echoSamples = [];
    this.playPhrase("echo");
    await sleep(300);
    while (this.speaker.isPlaying) await sleep(100);
    const during = averageDb(this.echoSamples);
    this.echoSamples = null;
    const deltaDb = Math.round((during - baseline) * 10) / 10;
    this.update({ echoTest: { deltaDb, echoLikely: deltaDb > 10 } });
  }

  // ---- 面接の進行 ------------------------------------------------------------

  start() {
    if (this.snapshot.status !== "ready" || !this.speaker) return;
    this.speaker.unlock();
    this.timers.countdown = setInterval(() => this.updateRemaining(), 1000);
    if (this.usesVoice) this.timers.detector = setInterval(() => this.tick(), 100);
    void this.performTurn({ kind: "start" }, "start", null);
  }

  /** 「回答を終える」ボタン */
  endAnswer() {
    if (this.snapshot.status === "listening" || this.snapshot.status === "answering") this.answer.manualEnd = true;
  }

  /** テキストで回答する(マイクを使わない場合) */
  submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || this.snapshot.status !== "listening") return;
    this.update({ candidateCaption: trimmed });
    void this.performTurn({ kind: "answer", answer: { text: trimmed, inputMode: "text" } }, "text", performance.now());
  }

  async finish() {
    if (this.snapshot.status === "finished") return;
    this.teardown();
    await this.context?.close().catch(() => undefined);
    this.update({ status: "finished", micLevel: 0, message: null });
    void this.requestFeedback();
  }

  /** 面接後の評価を作る(面接の終了時に自動で呼ぶ。失敗したら画面の「評価を作り直す」から呼ぶ) */
  async requestFeedback() {
    if (!this.config || this.snapshot.feedback.status === "loading") return;
    if (!this.history.some((turn) => turn.speaker === "candidate")) {
      this.update({ feedback: { status: "no_answers" } });
      return;
    }
    this.update({ feedback: { status: "loading" } });
    try {
      const result = await fetchFeedback(this.config.accessCode, {
        settings: this.config.settings,
        context: this.config.context,
        plan: this.plan,
        history: this.history,
      });
      this.update({ feedback: { status: "done", result } });
    } catch (error) {
      if (error instanceof ApiError && error.code === "NO_ANSWERS") this.update({ feedback: { status: "no_answers" } });
      else this.update({ feedback: { status: "failed", message: errorMessage(error) } });
    }
  }

  dispose() {
    this.teardown();
    void this.context?.close().catch(() => undefined);
  }

  /** 結果の書き出し(開発ステップ2の分析用) */
  exportResult() {
    return {
      exportedAt: new Date().toISOString(),
      settings: this.config?.settings,
      sttProvider: this.config?.sttProvider,
      /** 面接の途中で音声認識が使えなくなり、文字での回答に切り替えた理由 */
      sttFallback: this.snapshot.sttFallback,
      ttsProvider: this.config?.ttsProvider,
      earphones: this.config?.earphones,
      plan: this.plan,
      history: this.history,
      latencies: this.snapshot.latencies,
      latencySummary: summarize(this.snapshot.latencies),
      feedback: this.snapshot.feedback.status === "done" ? this.snapshot.feedback.result : null,
      echoTest: this.snapshot.echoTest,
    };
  }

  /** 音声認識が使えなくなったら、面接はそのまま続け、文字で回答してもらう */
  private fallBackToText(message: string) {
    if (!this.config || !this.usesVoice) return;
    this.stt?.close();
    this.stt = null;
    this.capture?.stop();
    this.capture = null;
    this.config = { ...this.config, sttProvider: "text" };
    clearTimeout(this.timers.silence);
    const answering = this.snapshot.status === "answering";
    if (answering) {
      this.answer = { ...freshAnswer(), encouraged: true };
      this.vad.resetUtterance();
    }
    this.update({ textMode: true, sttFallback: message, micLevel: 0, ...(answering ? { status: "listening" as const, candidateCaption: "" } : {}) });
  }

  private teardown() {
    Object.values(this.timers).forEach((timer) => clearInterval(timer));
    this.timers = {};
    this.turn?.abort.abort();
    this.turn = null;
    this.speaker?.stop();
    this.stt?.close();
    this.capture?.stop();
  }

  private updateRemaining() {
    if (this.state.startedAt === null || !this.config) return;
    const remaining = Math.round(this.config.settings.durationMin * 60 - (Date.now() - this.state.startedAt) / 1000);
    this.update({ remainingSec: remaining });
  }

  // ---- 面接官の応答(/turns) -------------------------------------------------

  private async performTurn(
    request: { kind: TurnRequestBody["kind"]; answer?: TurnRequestBody["answer"] },
    reason: string,
    t0: number | null,
    retried = false,
  ): Promise<void> {
    const config = this.config!;
    const turn: ActiveTurn = {
      abort: new AbortController(),
      reason,
      sentences: [],
      played: 0,
      appended: [],
      ackState: null,
      done: null,
      committed: false,
      firstStarted: false,
      t0,
      t1: performance.now(),
      t4: null,
    };
    this.turn = turn;
    this.update({ status: "waiting", message: null });
    if (!this.fullDuplex) this.stt?.pause();
    clearTimeout(this.timers.wait);
    this.timers.wait = setTimeout(() => {
      if (this.turn === turn && !turn.firstStarted) this.playPhrase("wait");
    }, WAIT_PHRASE_AFTER_MS);

    const body: TurnRequestBody = {
      kind: request.kind,
      settings: config.settings,
      context: config.context,
      plan: this.plan!,
      history: this.history,
      state: this.state,
      answer: request.answer,
      previous: this.previous,
      reply: true,
      ttsProvider: config.ttsProvider,
    };

    try {
      await postTurn(config.accessCode, body, turn.abort.signal, (event) => this.onTurnEvent(turn, event));
      if (!turn.done) throw new ApiError("応答が途中で途切れました", true);
    } catch (error) {
      if (turn.abort.signal.aborted || this.turn !== turn) return; // 割り込み・終了
      clearTimeout(this.timers.wait);
      this.speaker?.stop();
      const retryable = error instanceof ApiError ? error.retryable : true;
      if (retryable && !retried) return this.performTurn(request, reason, t0, true);

      this.turn = null;
      this.update({ message: errorMessage(error) });
      if (request.kind === "start") {
        Object.values(this.timers).forEach((timer) => clearInterval(timer));
        this.timers = {};
        this.update({ status: "ready" });
        return;
      }
      // 回答は記録せず、もう一度答えてもらう
      if (!this.playPhrase("retry")) this.enterListening(false);
    }
  }

  private onTurnEvent(turn: ActiveTurn, event: TurnEvent) {
    if (this.turn !== turn) return;
    switch (event.type) {
      case "ack":
        turn.appended = event.appended;
        turn.ackState = event.state;
        break;
      case "sentence":
        turn.sentences[event.index] = event.text;
        if (this.config?.ttsProvider === "browser") this.speaker?.enqueueSpeech(event.index, event.text);
        break;
      case "audio":
        this.speaker?.enqueueAudio(event.index, base64ToArrayBuffer(event.data));
        break;
      case "audio_missing":
        this.speaker?.enqueueSilence(event.index);
        break;
      case "phase":
        this.update({ phase: event.phase });
        break;
      case "done":
        turn.done = event;
        this.commit(turn, false);
        this.state = event.state;
        this.previous = undefined;
        this.update({ phase: event.state.phase, remainingSec: event.remainingSec });
        if (!this.speaker?.isPlaying) this.completeInterviewerTurn();
        break;
      case "error":
        throw new ApiError(event.message, event.retryable, event.code);
    }
  }

  /** 送った回答と面接官の発言を、会話履歴に確定させる */
  private commit(turn: ActiveTurn, interrupted: boolean) {
    if (turn.committed) return;
    turn.committed = true;
    const records = [...turn.appended];
    let interviewer = turn.done?.interviewerTurn ?? null;
    if (!interviewer) {
      const text = turn.sentences.filter(Boolean).join("");
      if (text) interviewer = { speaker: "interviewer", text, sentences: [...turn.sentences], llmContent: [{ type: "text", text }] };
    }
    if (interviewer) records.push(interrupted ? { ...interviewer, interrupted: true } : interviewer);
    this.history = [...this.history, ...records];
    this.update({ history: this.history });
  }

  private onSpeakerStart(index: number) {
    const status = this.snapshot.status;
    if (index === PHRASE_INDEX) {
      if (status === "listening") {
        if (!this.fullDuplex) this.stt?.pause();
        this.update({ status: "speaking" });
      }
      return;
    }
    const turn = this.turn;
    if (!turn) return;
    if (!turn.firstStarted) {
      turn.firstStarted = true;
      turn.t4 = performance.now();
      clearTimeout(this.timers.wait);
    }
    turn.played = Math.max(turn.played, index + 1);
    this.update({ status: "speaking", interviewerCaption: turn.sentences[index] ?? "" });
  }

  private onSpeakerIdle() {
    const status = this.snapshot.status;
    if (status === "finished" || status === "ready" || status === "preparing") return;
    if (this.turn) {
      if (this.turn.done) this.completeInterviewerTurn();
      return; // 続きの音声が届くのを待つ
    }
    // 定型フレーズの再生が終わった
    this.enterListening(false);
  }

  /** 面接官の発言(生成と再生)がすべて終わった */
  private completeInterviewerTurn() {
    const turn = this.turn;
    if (!turn?.done || this.speaker?.isPlaying) return;
    this.turn = null;
    clearTimeout(this.timers.wait);
    this.recordLatency(turn);
    if (turn.done.isClosing) {
      void this.finish();
      return;
    }
    this.enterListening(true);
  }

  private enterListening(newQuestion: boolean) {
    if (newQuestion) {
      this.answer = freshAnswer();
      this.answer.interviewerEndedAt = performance.now();
      this.vad.resetUtterance();
    }
    this.update({ status: "listening" });
    if (!this.usesVoice) return;
    // 半二重モードでは、面接官の声の余韻を拾わないよう少し待ってから聞き取りを再開する
    this.listenAfter = performance.now() + (this.fullDuplex ? 0 : HALF_DUPLEX_TAIL_MS);
    setTimeout(() => this.stt?.resume(), this.fullDuplex ? 0 : HALF_DUPLEX_TAIL_MS);
    clearTimeout(this.timers.silence);
    if (!this.answer.encouraged && this.answer.speechStartedAt === null) {
      this.timers.silence = setTimeout(() => {
        if (this.snapshot.status === "listening" && this.answer.speechStartedAt === null) {
          this.answer.encouraged = true;
          this.playPhrase("encourage");
        }
      }, ENCOURAGE_AFTER_MS);
    }
  }

  private playPhrase(key: PhraseKey): boolean {
    if (!this.speaker || !this.config) return false;
    if (this.config.ttsProvider === "browser") {
      this.speaker.enqueueSpeech(PHRASE_INDEX, PHRASES[key]);
      return true;
    }
    const audio = this.phrases.get(key);
    if (!audio) return false;
    this.speaker.enqueueAudio(PHRASE_INDEX, audio);
    return true;
  }

  // ---- 音声入力と話し終わりの判定 ----------------------------------------------

  private onFrame(frame: CaptureFrame) {
    if (this.stt && !this.stt.ownsMicrophone) this.stt.sendAudio(frame.pcm);
    this.echoSamples?.push(frame.rms);
    if (frame.at - this.lastLevelAt >= 100) {
      this.lastLevelAt = frame.at;
      this.update({ micLevel: EnergyVad.level(frame.rms) });
    }

    const event = this.vad.process(frame.rms, FRAME_MS, frame.at);
    if (!event) return;
    const status = this.snapshot.status;
    const listening = (status === "listening" || status === "answering") && frame.at >= this.listenAfter;
    const canBargeIn = this.fullDuplex && this.turn !== null && (status === "speaking" || status === "waiting");
    if (event.type === "start") {
      if (listening) this.onSpeechStart(event.at);
      else if (canBargeIn) this.answer.bargeStartAt = event.at;
    } else if (canBargeIn) {
      this.answer.bargeStartAt = null;
    }
  }

  private onSpeechStart(at: number) {
    if (this.answer.speechStartedAt === null) {
      this.answer.speechStartedAt = at;
      if (this.answer.interviewerEndedAt !== null) {
        this.answer.responseDelayMs = Math.max(0, Math.round(at - this.answer.interviewerEndedAt));
      }
    }
    clearTimeout(this.timers.silence);
    if (this.snapshot.status === "listening") this.update({ status: "answering" });
  }

  private onPartial(text: string) {
    this.answer.partial = text;
    if (text) {
      this.answer.lastPartialAt = performance.now();
      // 声が小さく音量で検知できなかった場合も、文字起こしが届いたら話し始めとみなす
      if (this.snapshot.status === "listening") this.onSpeechStart(performance.now());
    }
    if (this.snapshot.status === "answering" || this.snapshot.status === "listening") {
      this.update({ candidateCaption: this.currentText() });
    }
  }

  private onFinal(text: string) {
    this.answer.finals.push(text);
    if (this.snapshot.status === "listening") this.onSpeechStart(performance.now());
    if (this.snapshot.status === "answering" || this.snapshot.status === "listening") {
      this.update({ candidateCaption: this.currentText() });
    }
  }

  private currentText(): string {
    return (this.answer.finals.join("") + this.answer.partial).trim();
  }

  /** 100ミリ秒ごとに、割り込みと話し終わりを判定する */
  private tick() {
    const status = this.snapshot.status;
    const now = performance.now();

    if (this.fullDuplex && this.turn && (status === "speaking" || status === "waiting")) {
      const start = this.answer.bargeStartAt;
      if (start !== null && this.vad.isSpeaking && now - start >= BARGE_IN_MS && this.currentText()) this.interrupt();
      return;
    }

    if ((status !== "listening" && status !== "answering") || this.answer.finalizing) return;
    const lastVoiceAt = maxOrNull(this.vad.lastVoiceTime, this.answer.lastPartialAt);
    const totalVoiceMs = Math.max(
      this.vad.totalVoiceMs,
      this.answer.speechStartedAt !== null && lastVoiceAt !== null ? lastVoiceAt - this.answer.speechStartedAt : 0,
    );
    const decision = decideTurnEnd(
      {
        now,
        speechStartedAt: this.answer.speechStartedAt,
        lastVoiceAt,
        voiceActive: this.vad.isSpeaking,
        totalVoiceMs,
        text: this.currentText(),
        manualEnd: this.answer.manualEnd,
      },
      this.params,
    );
    // 応答時間の計測は、文字起こしの遅れを含まない「実際に声が途切れた時刻」から測る
    const speechEndedAt = this.vad.lastVoiceTime ?? this.answer.lastPartialAt;
    if (decision.end) void this.finalizeAnswer(decision.reason, speechEndedAt, totalVoiceMs);
  }

  private async finalizeAnswer(reason: string, speechEndedAt: number | null, totalVoiceMs: number) {
    this.answer.finalizing = true;
    // 文字にしている途中の音声があれば、結果が届くまで待つ(Google Cloud の音声認識)
    if (this.stt?.flush) await Promise.race([this.stt.flush(), sleep(STT_FLUSH_TIMEOUT_MS)]);
    // 途中結果が確定するのを少しだけ待つ
    const deadline = performance.now() + 600;
    while (this.answer.partial && performance.now() < deadline) await sleep(50);

    const text = this.currentText();
    if (!text) {
      this.answer.finalizing = false;
      this.answer.manualEnd = false;
      this.update({ message: "回答が聞き取れませんでした。もう一度お話しください" });
      return;
    }
    const answer = this.answer;
    this.answer = { ...freshAnswer(), encouraged: true };
    this.vad.resetUtterance();
    if (!this.fullDuplex) this.stt?.pause();
    clearTimeout(this.timers.silence);
    this.update({ candidateCaption: text, message: null });
    await this.performTurn(
      {
        kind: "answer",
        answer: {
          text,
          inputMode: "voice",
          speechMs: Math.round(totalVoiceMs),
          responseDelayMs: answer.responseDelayMs,
        },
      },
      reason,
      speechEndedAt ?? performance.now(),
    );
  }

  /** 面接官の発話中に求職者が話し始めた(全二重モードのみ) */
  private interrupt() {
    const turn = this.turn;
    if (!turn) return;
    this.speaker?.stop();
    clearTimeout(this.timers.wait);
    turn.abort.abort();
    this.commit(turn, true);
    this.state = turn.done?.state ?? turn.ackState ?? this.state;
    this.previous = { playedSentences: turn.played, interrupted: true };
    this.recordLatency(turn);
    this.turn = null;
    if (turn.done?.isClosing) {
      void this.finish();
      return;
    }
    const startedAt = this.answer.bargeStartAt;
    this.answer = { ...freshAnswer(), finals: this.answer.finals, partial: this.answer.partial, speechStartedAt: startedAt, encouraged: true };
    this.update({ status: "answering", candidateCaption: this.currentText() });
  }

  private recordLatency(turn: ActiveTurn) {
    if (turn.reason === "start") return;
    const record: LatencyRecord = {
      turn: ++this.turnCount,
      reason: turn.reason,
      detectMs: turn.t0 !== null ? Math.round(turn.t1 - turn.t0) : null,
      responseMs: turn.t4 !== null ? Math.round(turn.t4 - turn.t1) : null,
      totalMs: turn.t0 !== null && turn.t4 !== null ? Math.round(turn.t4 - turn.t0) : null,
      server: turn.done?.serverLatency ?? null,
      usage: turn.done?.usage ?? null,
    };
    this.update({ latencies: [...this.snapshot.latencies, record] });
  }
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function averageDb(samples: number[]): number {
  if (samples.length === 0) return -100;
  const meanSquare = samples.reduce((sum, rms) => sum + rms * rms, 0) / samples.length;
  return 10 * Math.log10(meanSquare + 1e-12);
}
