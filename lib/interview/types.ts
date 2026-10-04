import { z } from "zod";

export const STAGES = ["first", "second", "final"] as const;
export const STYLES = ["gentle", "standard", "strict"] as const;
export const DURATIONS = [5, 15, 30] as const;
export const INTERVIEWER_MODEL_KEYS = ["sonnet", "opus"] as const;
export const PHASES = ["opening", "main", "reverse_questions", "closing", "ended"] as const;

export type Stage = (typeof STAGES)[number];
export type Style = (typeof STYLES)[number];
export type InterviewerModelKey = (typeof INTERVIEWER_MODEL_KEYS)[number];
export type Phase = (typeof PHASES)[number];
export type Speaker = "interviewer" | "candidate" | "system";

export const STAGE_LABELS: Record<Stage, string> = {
  first: "一次面接(人事)",
  second: "二次面接(配属先の責任者)",
  final: "最終面接(役員)",
};

export const STYLE_LABELS: Record<Style, string> = {
  gentle: "やさしい",
  standard: "標準",
  strict: "厳しめ(深掘り多め)",
};

export const sessionSettingsSchema = z.object({
  stage: z.enum(STAGES),
  style: z.enum(STYLES),
  durationMin: z.union([z.literal(5), z.literal(15), z.literal(30)]),
  interviewerModel: z.enum(INTERVIEWER_MODEL_KEYS),
  voiceId: z.string().max(40),
  /** 声の高さ(半音)と話す速さ(倍率)の調整 */
  voicePitch: z.number().min(-6).max(6).optional(),
  voiceRate: z.number().min(0.8).max(1.2).optional(),
  /** 面接官の名前(アバターの名札と合わせる。なければ面接官は所属だけを名乗る) */
  interviewerName: z.string().trim().max(40).optional(),
});
export type SessionSettings = z.infer<typeof sessionSettingsSchema>;

/** 面接の前提となる求職者・求人の情報(本番では context_snapshot に相当) */
export const candidateContextSchema = z.object({
  companyName: z.string().max(200),
  position: z.string().max(200),
  jobDescription: z.string().max(20000),
  careerSummary: z.string().max(20000),
  reasonForChange: z.string().max(5000),
});
export type CandidateContext = z.infer<typeof candidateContextSchema>;

/**
 * 面接官ターンの Claude 応答 content ブロック。思考ブロックなどを変更せずに再送するため、
 * 受け取った形のまま保持する(設計書 4.4)。
 */
export const llmContentBlockSchema = z
  .object({
    type: z.enum(["text", "thinking", "redacted_thinking", "fallback"]),
  })
  .passthrough();

export const turnRecordSchema = z.object({
  speaker: z.enum(["interviewer", "candidate", "system"]),
  text: z.string().max(20000),
  llmContent: z.array(llmContentBlockSchema).max(20).optional(),
  sentences: z.array(z.string().max(2000)).max(100).optional(),
  interrupted: z.boolean().optional(),
  inputMode: z.enum(["voice", "text"]).optional(),
  speechMs: z.number().int().nonnegative().optional(),
  responseDelayMs: z.number().int().nonnegative().optional(),
  charsPerMinute: z.number().nonnegative().optional(),
});
export type TurnRecord = z.infer<typeof turnRecordSchema>;

export const sessionStateSchema = z.object({
  startedAt: z.number().int().nullable(),
  phase: z.enum(PHASES),
  noticesSent: z.array(z.string().max(40)).max(20),
});
export type SessionState = z.infer<typeof sessionStateSchema>;

export const INITIAL_SESSION_STATE: SessionState = {
  startedAt: null,
  phase: "opening",
  noticesSent: [],
};

export type ServerLatency = {
  firstTokenMs: number | null;
  firstSentenceMs: number | null;
  firstAudioMs: number | null;
  totalMs: number;
};

export type UsageSummary = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AudioFormat = "mp3" | "wav";

/** /turns が返す NDJSON の1行(設計書 5.5) */
export type TurnEvent =
  /** 回答を受け付けた。state は応答の生成前の状態(割り込みで done が届かないときに使う) */
  | { type: "ack"; appended: TurnRecord[]; state: SessionState }
  | { type: "sentence"; index: number; text: string }
  | { type: "audio"; index: number; format: AudioFormat; data: string }
  /** 音声合成に失敗した文。ブラウザは字幕だけ表示して次の文へ進む */
  | { type: "audio_missing"; index: number }
  | { type: "phase"; phase: Phase }
  | {
      type: "done";
      interviewerTurn: TurnRecord | null;
      state: SessionState;
      isClosing: boolean;
      remainingSec: number | null;
      sentenceCount: number;
      serverLatency: ServerLatency;
      usage: UsageSummary | null;
    }
  | { type: "error"; code: string; message: string; retryable: boolean };
