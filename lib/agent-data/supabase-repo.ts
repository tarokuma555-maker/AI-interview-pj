import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent } from "@/lib/auth/types";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
import type { LinkInput, SeekerInput } from "./schemas";
import { summarizeLinks, summarizeSeekers } from "./summary";
import type { AgentRepo, PracticeLink, Seeker, SessionRow } from "./types";

type SeekerRow = { id: string; advisor_id: string; name: string; occupation: string; career_summary: string; reason_for_change: string; created_at: string; updated_at: string };
type LinkRow = { id: string; seeker_id: string; company_name: string; position: string; job_description: string; stage: LinkInput["stage"]; style: LinkInput["style"]; duration_min: LinkInput["durationMin"]; disabled_at: string | null; created_at: string };
const seeker = (r: SeekerRow): Seeker => ({ id: r.id, advisorId: r.advisor_id, name: r.name, occupation: r.occupation, careerSummary: r.career_summary, reasonForChange: r.reason_for_change, createdAt: r.created_at, updatedAt: r.updated_at });
const link = (r: LinkRow): PracticeLink => ({ id: r.id, seekerId: r.seeker_id, companyName: r.company_name, position: r.position, jobDescription: r.job_description, stage: r.stage, style: r.style, durationMin: r.duration_min, disabled: r.disabled_at !== null, createdAt: r.created_at });
const seekerWrite = (s: SeekerInput) => ({ name: s.name, occupation: s.occupation, career_summary: s.careerSummary, reason_for_change: s.reasonForChange });
const linkWrite = (l: LinkInput) => ({ company_name: l.companyName, position: l.position, job_description: l.jobDescription, stage: l.stage, style: l.style, duration_min: l.durationMin });
const seekerColumns = "id,advisor_id,name,occupation,career_summary,reason_for_change,created_at,updated_at";
const linkColumns = "id,seeker_id,company_name,position,job_description,stage,style,duration_min,disabled_at,created_at";
// 不正なURLも「見つからない」に統一する。DBのエラー詳細や入力は利用者・ログへ出さない。
const uuid = (id: string) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
function checked<T>({ data, error }: { data: T; error: unknown }): T {
  if (error) throw new Error("保存先に接続できません。少し待って、もう一度お試しください");
  return data;
}
/** 設計 2026-10-27 5章。ログイン本人の接続を使用し、すべての操作にRLSを適用。 */
export function createSupabaseRepo(client: SupabaseClient, agent: Agent): AgentRepo {
  async function sessions(seekerId?: string): Promise<SessionRow[]> {
    let query = client.from("interview_sessions").select("id,link_id,seeker_id,started_at,evaluations(status,result)");
    if (seekerId) query = query.eq("seeker_id", seekerId);
    const rows = checked(await query) ?? [];
    return rows.map(r => {
      const evaluation = Array.isArray(r.evaluations) ? r.evaluations[0] : r.evaluations;
      const score = evaluation?.status === "done" ? (evaluation.result?.feedback?.overall_score ?? evaluation.result?.overall_score) : null;
      return { id: r.id, linkId: r.link_id, seekerId: r.seeker_id, startedAt: r.started_at, score: typeof score === "number" && Number.isFinite(score) ? score : null };
    });
  }
  const repo: AgentRepo = {
    async listSeekers() {
      const rows = checked(await client.from("seekers").select(seekerColumns).order("created_at", { ascending: false })) ?? [];
      const links = checked(await client.from("practice_links").select(linkColumns)) ?? [];
      return summarizeSeekers(rows.map(seeker), links.map(link), await sessions());
    },
    async getSeeker(id) { if (!uuid(id)) return null; const row = checked(await client.from("seekers").select(seekerColumns).eq("id", id).maybeSingle()); return row ? seeker(row) : null; },
    async createSeeker(input) { const row = checked(await client.from("seekers").insert({ ...seekerWrite(input), advisor_id: agent.id }).select("id").single()); return row!.id; },
    async updateSeeker(id, input) { if (!uuid(id)) return false; return !!checked(await client.from("seekers").update(seekerWrite(input)).eq("id", id).select("id").maybeSingle()); },
    async deleteSeeker(id) { if (!uuid(id)) return false; return !!checked(await client.from("seekers").delete().eq("id", id).select("id").maybeSingle()); },
    async listLinks(sid) { if (!await repo.getSeeker(sid)) return []; const rows = checked(await client.from("practice_links").select(linkColumns).eq("seeker_id", sid)) ?? []; return summarizeLinks(rows.map(link), await sessions(sid), id => linkKey(id, linkSecret())); },
    async getLink(sid, id) { if (!uuid(sid) || !uuid(id)) return null; const row = checked(await client.from("practice_links").select(linkColumns).eq("seeker_id", sid).eq("id", id).maybeSingle()); return row ? link(row) : null; },
    async createLink(sid, input) { if (!await repo.getSeeker(sid)) return null; const id = randomUUID(); checked(await client.from("practice_links").insert({ ...linkWrite(input), id, seeker_id: sid, key_hash: hashLinkKey(linkKey(id, linkSecret())) })); return id; },
    async updateLink(sid, id, input) { if (!uuid(sid) || !uuid(id)) return false; return !!checked(await client.from("practice_links").update(linkWrite(input)).eq("seeker_id", sid).eq("id", id).select("id").maybeSingle()); },
    async setLinkDisabled(sid, id, disabled) { if (!uuid(sid) || !uuid(id)) return false; return !!checked(await client.from("practice_links").update({ disabled_at: disabled ? new Date().toISOString() : null }).eq("seeker_id", sid).eq("id", id).select("id").maybeSingle()); },
  };
  return repo;
}
