import type { FeedbackResult } from "@/features/interview/client/poc-api";
import { canRetry } from "@/lib/practice-link/evaluate";
import type { LinkSummary, PracticeLink, PracticeSummary, Seeker, SeekerSummary, SessionRow } from "./types";
/** 設計 2026-10-27 4.1。未評価の練習は最新の点数を上書きしない。 */
function latest(sessions: SessionRow[]) {
  return sessions.filter(s => s.score !== null).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}
export function summarizeSeekers(seekers: Seeker[], links: PracticeLink[], sessions: SessionRow[]): SeekerSummary[] {
  return [...seekers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(s => {
    const last = latest(sessions.filter(r => r.seekerId === s.id));
    return { id: s.id, name: s.name, occupation: s.occupation, linkCount: links.filter(l => l.seekerId === s.id).length, latestScore: last?.score ?? null, latestAt: last?.startedAt ?? null };
  });
}
export function summarizeLinks(links: PracticeLink[], sessions: SessionRow[], keyFor: (id: string) => string): LinkSummary[] {
  return [...links].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(l => {
    const rows = sessions.filter(s => s.linkId === l.id);
    return { ...l, key: l.disabled ? "" : keyFor(l.id), practiceCount: rows.length, latestScore: latest(rows)?.score ?? null };
  });
}

/** 練習1回分の状態(設計 2026-10-27 4.1 ④、段階D) */
export type PracticeFacts = { id: string; startedAt: string; finishedAt: string | null; evaluation: "none" | "pending" | "done" | "failed"; evaluatedAt: string | null; result: FeedbackResult | null };
export function practiceSummary(p: PracticeFacts, now = new Date()): PracticeSummary {
  const score = p.evaluation === "done" ? (p.result?.feedback?.overall_score ?? null) : null;
  const status: PracticeSummary["status"] = !p.finishedAt ? "unfinished"
    : p.evaluation === "failed" ? "failed"
    : p.evaluation === "done" ? (p.result ? "done" : "no_answers")
    : "preparing";
  return { id: p.id, startedAt: p.startedAt, finishedAt: p.finishedAt, score, status, retryable: canRetry(p, now) };
}
/** 新しい順の一覧で、指定の練習より前に結果が出た最新の点数 */
export function previousScore(list: PracticeSummary[], id: string): number | null {
  const index = list.findIndex(p => p.id === id);
  return list.slice(index + 1).find(p => p.score !== null)?.score ?? null;
}
