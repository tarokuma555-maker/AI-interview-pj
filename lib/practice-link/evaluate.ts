import { generateFeedback, NoAnswerError } from "@/lib/ai/feedback";
import { mockFeedback } from "@/lib/ai/mock";
import { isMockAi } from "@/lib/ai/models";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { TurnRecord } from "@/lib/interview/types";
import type { PracticeRepo, PracticeSession } from "./types";

/**
 * 練習の評価を作って保存する(設計 2026-10-27 6章)。終了時・求職者の作り直し・エージェントの作り直しで共通に使う。
 * 評価の処理の上限(300秒)を過ぎても作成中のままなら、止まったものとして作り直せる。
 */
export const STALE_EVALUATION_MS = 6 * 60 * 1000;

export function canRetry(session: Pick<PracticeSession, "finishedAt" | "evaluation" | "evaluatedAt">, now = new Date()): boolean {
  if (!session.finishedAt) return false;
  if (session.evaluation === "failed") return true;
  return session.evaluation === "pending" && Date.parse(session.evaluatedAt ?? "") < now.getTime() - STALE_EVALUATION_MS;
}

export async function evaluatePractice(repo: PracticeRepo, linkId: string, session: PracticeSession, history: TurnRecord[], plan: QuestionPlan | null): Promise<void> {
  try {
    const input = { settings: session.settings, context: session.context, history, plan };
    const result = isMockAi() ? mockFeedback(input) : await generateFeedback(input);
    await repo.complete(linkId, session.id, result.metrics.length ? result : null, false);
  } catch (e) {
    await repo.complete(linkId, session.id, null, !(e instanceof NoAnswerError)).catch(() => undefined);
  }
}
