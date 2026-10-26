import type { LinkSummary, PracticeLink, Seeker, SeekerSummary, SessionRow } from "./types";
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
