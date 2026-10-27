import { randomUUID } from "node:crypto";
import type { Agent } from "@/lib/auth/types";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
import type { PracticeSession } from "@/lib/practice-link/types";
import { practiceSummary, previousScore, summarizeLinks, summarizeSeekers } from "./summary";
import type { AgentRepo, PracticeLink, Seeker, SessionRow } from "./types";
import { withAccessLog, type AccessLog } from "./access-log";
export type MemoryData = { seekers: Seeker[]; links: (PracticeLink & { keyHash: string })[]; sessions: SessionRow[]; accessLogs?: AccessLog[] };
const globals = globalThis as typeof globalThis & { agentData?: MemoryData };
export function memoryData(): MemoryData { return globals.agentData ??= { seekers: [], links: [], sessions: [] }; }
/** 設計 2026-10-27 8章。開発用でも担当の境界と削除時の連動を守る。 */
export function createMemoryRepo(agent: Agent, store: MemoryData = memoryData()): AgentRepo {
  const owns = (id: string) => store.seekers.find(s => s.id === id && (s.advisorId === agent.id || agent.role === "admin"));
  const getLink = (sid: string, id: string) => owns(sid) ? store.links.find(l => l.seekerId === sid && l.id === id) : undefined;
  // 練習の記録(段階C以降の形)だけを、新しい順に
  const practices = (sid: string, lid: string) => getLink(sid, lid)
    ? (store.sessions.filter(s => s.linkId === lid && s.seekerId === sid && "settings" in s) as PracticeSession[]).sort((x, y) => y.startedAt.localeCompare(x.startedAt))
    : null;
  const publicLink = ({ keyHash: _hash, ...link }: MemoryData["links"][number]) => { void _hash; return link; };
  const repo: AgentRepo = {
    async listSeekers() { return summarizeSeekers(store.seekers.filter(s => owns(s.id)), store.links, store.sessions); },
    async getSeeker(id) { const s = owns(id); return s ? { ...s } : null; },
    async createSeeker(input) { const id = randomUUID(), now = new Date().toISOString(); store.seekers.push({ ...input, id, advisorId: agent.id, createdAt: now, updatedAt: now }); return id; },
    async updateSeeker(id, input) { const s = owns(id); if (!s) return false; Object.assign(s, input, { updatedAt: new Date().toISOString() }); return true; },
    async deleteSeeker(id) { if (!owns(id)) return false; store.seekers = store.seekers.filter(s => s.id !== id); store.links = store.links.filter(l => l.seekerId !== id); store.sessions = store.sessions.filter(s => s.seekerId !== id); return true; },
    async listLinks(sid) { if (!owns(sid)) return []; return summarizeLinks(store.links.filter(l => l.seekerId === sid).map(publicLink), store.sessions, id => linkKey(id, linkSecret())); },
    async getLink(sid, id) { const l = getLink(sid, id); return l ? publicLink(l) : null; },
    async createLink(sid, input) { if (!owns(sid)) return null; const id = randomUUID(); store.links.push({ ...input, id, seekerId: sid, disabled: false, createdAt: new Date().toISOString(), keyHash: hashLinkKey(linkKey(id, linkSecret())) }); return id; },
    async updateLink(sid, id, input) { const l = getLink(sid, id); if (!l) return false; Object.assign(l, input); return true; },
    async setLinkDisabled(sid, id, disabled) { const l = getLink(sid, id); if (!l) return false; l.disabled = disabled; return true; },
    async listPractices(sid, lid) { return practices(sid, lid)?.map(p => practiceSummary(p)) ?? null; },
    async getPractice(sid, lid, id) {
      const all = practices(sid, lid), p = all?.find(x => x.id === id); if (!all || !p) return null;
      const list = all.map(x => practiceSummary(x));
      return { ...practiceSummary(p), linkId: lid, history: structuredClone(p.history), result: structuredClone(p.result), previousScore: previousScore(list, id) };
    },
  };
  return withAccessLog(repo, agent.id, async entries => {
    (store.accessLogs ??= []).push(...entries.map(entry => ({ ...entry, createdAt: new Date().toISOString() })));
  });
}
