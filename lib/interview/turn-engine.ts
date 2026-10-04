import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { InterviewerModel } from "@/lib/ai/interviewer";
import { buildMessages } from "@/lib/ai/messages";
import { FORCED_CLOSING_TEXT, REFUSAL_FALLBACK_TEXT } from "@/lib/ai/prompts/interviewer";
import { SentenceSplitter, type SplitResult } from "@/lib/ai/sentence-splitter";
import type { TtsClient } from "@/lib/speech/tts/types";
import { checkTime, interruptionNotice, remainingSeconds } from "./phase";
import { charsPerMinute } from "./speech-metrics";
import type {
  SessionSettings,
  SessionState,
  TurnEvent,
  TurnRecord,
  UsageSummary,
} from "./types";

/**
 * 会話の1往復を処理するターンエンジン(設計書 3.5)。
 * Next.js に依存しないので、応答の遅さが問題になったときは自前サーバーへそのまま移せる。
 * 永続化は呼び出し側の責務で、ここでは追記されたターンと新しい状態をイベントで返す。
 */

export type TurnKind = "start" | "answer" | "continue";

export type TurnInput = {
  kind: TurnKind;
  settings: SessionSettings;
  sessionContext: string;
  history: TurnRecord[];
  state: SessionState;
  answer?: { text: string; inputMode: "voice" | "text"; speechMs?: number; responseDelayMs?: number };
  /** 直前の面接官の発言を何文目まで再生したか、割り込んだか */
  previous?: { playedSentences: number; interrupted: boolean };
  /** false のときは回答を保存するだけで、面接官の応答を生成しない(1問ずつモード) */
  reply: boolean;
};

export type TurnDeps = {
  interviewer: InterviewerModel;
  /** null のときは音声合成をしない(ブラウザで読み上げる) */
  tts: TtsClient | null;
  signal: AbortSignal;
  now?: () => number;
};

export class TurnError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TTS_CONCURRENCY = 2;

export function runTurn(input: TurnInput, deps: TurnDeps): AsyncIterable<TurnEvent> {
  const queue = new AsyncQueue<TurnEvent>();
  produce(input, deps, (event) => queue.push(event))
    .catch((error: unknown) => {
      if (deps.signal.aborted) return; // ブラウザ側が中断した(割り込み)
      queue.push(toErrorEvent(error));
    })
    .finally(() => queue.close());
  return queue;
}

async function produce(input: TurnInput, deps: TurnDeps, emit: (event: TurnEvent) => void) {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const state: SessionState = { ...input.state, noticesSent: [...input.state.noticesSent] };
  const appended: TurnRecord[] = [];

  if (input.kind === "start") {
    if (input.history.length > 0 || state.startedAt !== null) throw new TurnError("ALREADY_STARTED", "面接はすでに始まっています");
    state.startedAt = startedAt;
    state.phase = "opening";
  } else if (state.startedAt === null) {
    throw new TurnError("NOT_STARTED", "面接がまだ始まっていません");
  }
  if (state.phase === "ended") throw new TurnError("ALREADY_ENDED", "面接はすでに終了しています");

  if (input.kind === "answer") {
    const text = input.answer?.text.trim() ?? "";
    if (!text) throw new TurnError("EMPTY_ANSWER", "回答が空です");
    appended.push({
      speaker: "candidate",
      text,
      inputMode: input.answer?.inputMode,
      speechMs: input.answer?.speechMs,
      responseDelayMs: input.answer?.responseDelayMs,
      charsPerMinute: charsPerMinute(text, input.answer?.speechMs),
    });
    if (state.phase === "opening") state.phase = "main";
  }

  // システムメッセージは求職者の発言の直後にしか置けない(設計書 4.2)
  const time = checkTime(input.settings, state, startedAt);
  const lastTurn = [...input.history, ...appended].at(-1);
  if (lastTurn?.speaker === "candidate") {
    const notes: string[] = [];
    if (input.previous?.interrupted) {
      const lastInterviewer = [...input.history].reverse().find((t) => t.speaker === "interviewer");
      if (lastInterviewer) {
        notes.push(interruptionNotice(lastInterviewer.sentences ?? [lastInterviewer.text], input.previous.playedSentences));
      }
    }
    for (const notice of time.notices) {
      notes.push(notice.text);
      state.noticesSent.push(notice.key);
    }
    if (notes.length > 0) appended.push({ speaker: "system", text: notes.join("\n") });
  }
  emit({ type: "ack", appended, state: { ...state, noticesSent: [...state.noticesSent] } });

  const latency = { firstTokenAt: null as number | null, firstSentenceAt: null as number | null, firstAudioAt: null as number | null };
  const sentences: string[] = [];
  let isClosing = false;
  let usage: UsageSummary | null = null;
  let content: BetaContentBlockParam[] | null = null;

  if (input.reply) {
    const pipeline = new OrderedTtsPipeline(deps.tts, input.settings.voiceId, deps.signal, emit, () => {
      latency.firstAudioAt ??= now();
    });
    const splitter = new SentenceSplitter();
    const handle = (result: SplitResult) => {
      for (const tag of result.tags) {
        if (tag === "REVERSE" && (state.phase === "opening" || state.phase === "main")) {
          state.phase = "reverse_questions";
          emit({ type: "phase", phase: state.phase });
        } else if (tag === "END") {
          state.phase = "ended";
          isClosing = true;
          emit({ type: "phase", phase: state.phase });
        }
      }
      for (const sentence of result.sentences) {
        const index = sentences.length;
        sentences.push(sentence);
        latency.firstSentenceAt ??= now();
        emit({ type: "sentence", index, text: sentence });
        pipeline.add(index, sentence);
      }
    };

    if (time.forceClose) {
      handle(splitter.push(FORCED_CLOSING_TEXT));
      handle(splitter.flush());
      state.phase = "ended";
      isClosing = true;
      content = [{ type: "text", text: FORCED_CLOSING_TEXT }];
    } else {
      const result = await deps.interviewer.stream(
        {
          modelKey: input.settings.interviewerModel,
          sessionContext: input.sessionContext,
          messages: buildMessages([...input.history, ...appended]),
        },
        (delta) => {
          latency.firstTokenAt ??= now();
          handle(splitter.push(delta));
        },
        deps.signal,
      );
      handle(splitter.flush());
      usage = result.usage;
      if (sentences.length === 0) {
        // 応答が拒否された・空だったときは、定型の言い直しで会話を続ける
        handle(splitter.push(REFUSAL_FALLBACK_TEXT));
        handle(splitter.flush());
        content = [{ type: "text", text: REFUSAL_FALLBACK_TEXT }];
      } else {
        content = result.content;
      }
    }
    await pipeline.drain();
  }

  const interviewerTurn: TurnRecord | null =
    sentences.length > 0 && content
      ? {
          speaker: "interviewer",
          text: sentences.join(""),
          sentences,
          llmContent: content as unknown as TurnRecord["llmContent"],
        }
      : null;

  const since = (t: number | null) => (t === null ? null : t - startedAt);
  emit({
    type: "done",
    interviewerTurn,
    state,
    isClosing,
    remainingSec: remainingSeconds(input.settings, state, now()),
    sentenceCount: sentences.length,
    serverLatency: {
      firstTokenMs: since(latency.firstTokenAt),
      firstSentenceMs: since(latency.firstSentenceAt),
      firstAudioMs: since(latency.firstAudioAt),
      totalMs: now() - startedAt,
    },
    usage,
  });
}

function toErrorEvent(error: unknown): TurnEvent {
  if (error instanceof TurnError) {
    return { type: "error", code: error.code, message: error.message, retryable: false };
  }
  console.error("turn failed", error);
  return { type: "error", code: "AI_UNAVAILABLE", message: "面接官の応答を生成できませんでした", retryable: true };
}

/**
 * 文ごとの音声合成を並行して行い(最大 TTS_CONCURRENCY 件)、結果は文の順番どおりに返す。
 */
class OrderedTtsPipeline {
  private chain: Promise<void> = Promise.resolve();
  private active = 0;
  private waiting: Array<() => void> = [];

  constructor(
    private readonly tts: TtsClient | null,
    private readonly voiceId: string,
    private readonly signal: AbortSignal,
    private readonly emit: (event: TurnEvent) => void,
    private readonly onAudio: () => void,
  ) {}

  add(index: number, text: string) {
    const tts = this.tts;
    if (!tts) return;
    const result = this.limited(() => tts.synthesize(text, this.voiceId, this.signal)).then(
      (audio) => ({ ok: true as const, audio }),
      (error: unknown) => ({ ok: false as const, error }),
    );
    this.chain = this.chain.then(async () => {
      const r = await result;
      if (this.signal.aborted) return;
      if (r.ok) {
        this.onAudio();
        this.emit({ type: "audio", index, format: r.audio.format, data: Buffer.from(r.audio.data).toString("base64") });
      } else {
        console.error("tts failed", r.error);
        this.emit({ type: "audio_missing", index });
      }
    });
  }

  drain(): Promise<void> {
    return this.chain;
  }

  private async limited<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= TTS_CONCURRENCY) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}

/** イベントを生成側から読み出し側へ渡すキュー */
class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private closed = false;
  private notify: (() => void) | null = null;

  push(item: T) {
    if (this.closed) return;
    this.items.push(item);
    this.notify?.();
  }

  close() {
    this.closed = true;
    this.notify?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.items.length > 0) {
        yield this.items.shift()!;
        continue;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => (this.notify = resolve));
      this.notify = null;
    }
  }
}
