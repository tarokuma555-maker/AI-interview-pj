import type { PracticeSession } from "./types";

/**
 * 結果を作り直せるか(設計 2026-10-27 6章、段階D)。画面からも使うため、AIの処理を含めない。
 * 評価の処理の上限(300秒)を過ぎても作成中のままなら、止まったものとして作り直せる。
 */
export const STALE_EVALUATION_MS = 6 * 60 * 1000;

export function canRetry(session: Pick<PracticeSession, "finishedAt" | "evaluation" | "evaluatedAt">, now = new Date()): boolean {
  if (!session.finishedAt) return false;
  if (session.evaluation === "failed") return true;
  return session.evaluation === "pending" && Date.parse(session.evaluatedAt ?? "") < now.getTime() - STALE_EVALUATION_MS;
}
