import { generateFeedback, NoAnswerError } from "@/lib/ai/feedback";
import { mockFeedback } from "@/lib/ai/mock";
import { isMockAi } from "@/lib/ai/models";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { TurnRecord } from "@/lib/interview/types";
import type { PracticeRepo, PracticeSession } from "./types";
export { canRetry, STALE_EVALUATION_MS } from "./retry";

/**
 * 練習の評価を作って保存する(設計 2026-10-27 6章)。終了時・求職者の作り直し・エージェントの作り直しで共通に使う。
 */
export async function evaluatePractice(repo: PracticeRepo, linkId: string, session: PracticeSession, history: TurnRecord[], plan: QuestionPlan | null): Promise<void> {
  try {
    const input = { settings: session.settings, context: session.context, history, plan };
    const result = isMockAi() ? mockFeedback(input) : await generateFeedback(input);
    await repo.complete(linkId, session.id, result.metrics.length ? result : null, false);
  } catch (e) {
    await repo.complete(linkId, session.id, null, !(e instanceof NoAnswerError)).catch(() => undefined);
  }
}
