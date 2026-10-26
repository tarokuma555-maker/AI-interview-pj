import { randomUUID } from "node:crypto";
import type { Agent } from "@/lib/auth/types";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
import { summarizeLinks, summarizeSeekers } from "./summary";
import type { AgentRepo, PracticeLink, Seeker, SessionRow } from "./types";
export type MemoryData = { seekers: Seeker[]; links: (PracticeLink & { keyHash: string })[]; sessions: SessionRow[] };
const globals = globalThis as typeof globalThis & { agentData?: MemoryData };
/** 設計 2026-10-27 8章。開発用でも担当の境界と削除時の連動を守る。 */
export function createMemoryRepo(agent: Agent, store: MemoryData = globals.agentData ??= { seekers: [], links: [], sessions: [] }): AgentRepo {
  const owns = (id: string) => store.seekers.find(s => s.id === id && (s.advisorId === agent.id || agent.role === "admin"));
  const getLink = (sid: string, id: string) => owns(sid) ? store.links.find(l => l.seekerId === sid && l.id === id) : undefined;
  const publicLink = ({ keyHash: _hash, ...link }: MemoryData["links"][number]) => { void _hash; return link; };
  return {
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
  };
}
