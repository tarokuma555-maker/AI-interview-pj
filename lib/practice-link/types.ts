import type { FeedbackResult } from "@/features/interview/client/poc-api";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { CandidateContext, SessionSettings, TurnRecord } from "@/lib/interview/types";
import type { SessionRow } from "@/lib/agent-data/types";
export type PracticeTarget = { id: string; seekerId: string; name: string; settings: SessionSettings; context: CandidateContext };
export type PracticeSession = SessionRow & {
  requestId: string; settings: SessionSettings; context: CandidateContext;
  finishedAt: string | null; history: TurnRecord[]; plan: QuestionPlan | null;
  evaluation: "none" | "pending" | "done" | "failed";
  /** 評価の状態が最後に変わった日時(作成中のまま止まったかの判断に使う) */
  evaluatedAt: string | null;
  result: FeedbackResult | null;
};
export interface PracticeRepo {
  resolve(hash: string): Promise<PracticeTarget | null>;
  list(linkId: string): Promise<PracticeSession[]>;
  get(linkId: string, sessionId: string): Promise<PracticeSession | null>;
  start(hash: string, requestId: string, answerBy: "voice" | "text", voiceId: string): Promise<PracticeSession>;
  finish(linkId: string, sessionId: string, history: TurnRecord[], plan: QuestionPlan | null): Promise<boolean>;
  complete(linkId: string, sessionId: string, result: FeedbackResult | null, failed: boolean): Promise<void>;
  /** 失敗・止まった評価を作り直す権利を取る(取れたら true。設計 6章・段階D) */
  reopen(linkId: string, sessionId: string, now?: Date): Promise<boolean>;
}
export class PracticeError extends Error {
  constructor(readonly code: string) { super(code); }
}
