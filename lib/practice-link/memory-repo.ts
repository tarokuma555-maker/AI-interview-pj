import { randomUUID } from "node:crypto";
import { memoryData, type MemoryData } from "@/lib/agent-data/memory-repo";
import { STALE_EVALUATION_MS } from "./evaluate";
import { targetSnapshot, quotaCode } from "./snapshot";
import { PracticeError, type PracticeRepo, type PracticeSession } from "./types";
/** 開発用。開始の上限確認と追加の間にawaitを挟まず、同時開始も直列に処理する。 */
export function createMemoryPracticeRepo(store: MemoryData = memoryData(), clock = () => new Date()): PracticeRepo {
  const resolve = (hash: string) => {
    const link = store.links.find(l => l.keyHash === hash && !l.disabled);
    const seeker = link && store.seekers.find(s => s.id === link.seekerId);
    return link && seeker ? targetSnapshot(seeker, link) : null;
  };
  const get = (linkId: string, id: string) => store.sessions.find(s => s.linkId === linkId && s.id === id && "settings" in s) as PracticeSession | undefined;
  return {
    async resolve(hash) { return resolve(hash); },
    async list(linkId) { return structuredClone(store.sessions.filter(s => s.linkId === linkId && "settings" in s).sort((a,b) => b.startedAt.localeCompare(a.startedAt))) as PracticeSession[]; },
    async get(linkId, id) { const s = get(linkId, id); return s ? structuredClone(s) : null; },
    async start(hash, requestId, answerBy, voiceId) {
      const target = resolve(hash); if (!target) throw new PracticeError("INVALID_LINK");
      const old = store.sessions.find(s => s.linkId === target.id && "requestId" in s && s.requestId === requestId) as PracticeSession | undefined;
      if (old) return structuredClone(old);
      const limit = quotaCode(store.sessions.filter(s => s.seekerId === target.seekerId).map(s => s.startedAt), clock());
      if (limit) throw new PracticeError(limit);
      const session: PracticeSession = { id: randomUUID(), linkId: target.id, seekerId: target.seekerId, requestId,
        settings: { ...target.settings, answerBy, voiceId }, context: target.context, startedAt: clock().toISOString(), finishedAt: null,
        history: [], plan: null, score: null, result: null, evaluation: "none", evaluatedAt: null };
      store.sessions.push(session); return structuredClone(session);
    },
    async finish(linkId, id, history, plan) {
      const session = get(linkId,id); if (!session || session.finishedAt) return false;
      Object.assign(session, { history: structuredClone(history), plan: structuredClone(plan), finishedAt: clock().toISOString(), evaluation: "pending", evaluatedAt: clock().toISOString() }); return true;
    },
    async complete(linkId, id, result, failed) {
      const session = get(linkId,id); if (!session || session.evaluation !== "pending") return;
      Object.assign(session, { result, score: result?.feedback.overall_score ?? null, evaluation: failed ? "failed" : "done", evaluatedAt: clock().toISOString() });
    },
    async reopen(linkId, id, now = clock()) {
      const session = get(linkId,id); if (!session?.finishedAt) return false;
      const stale = session.evaluation === "pending" && Date.parse(session.evaluatedAt ?? "") < now.getTime() - STALE_EVALUATION_MS;
      if (session.evaluation !== "failed" && !stale) return false;
      Object.assign(session, { evaluation: "pending", result: null, score: null, evaluatedAt: now.toISOString() }); return true;
    },
  };
}
