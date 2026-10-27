import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackResult } from "@/features/interview/client/poc-api";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import { candidateContextSchema, sessionSettingsSchema, type TurnRecord } from "@/lib/interview/types";
import { STALE_EVALUATION_MS } from "./retry";
import { PracticeError, type PracticeRepo, type PracticeSession } from "./types";

type Row = { id: string; link_id: string; seeker_id: string; request_id: string; settings: unknown; context: unknown; history: TurnRecord[]; plan: QuestionPlan | null; started_at: string; finished_at: string | null; evaluations: { status: "pending" | "done" | "failed"; result: FeedbackResult | null; updated_at: string } | null };
function session(row: Row): PracticeSession {
  return { id: row.id, linkId: row.link_id, seekerId: row.seeker_id, requestId: row.request_id,
    settings: sessionSettingsSchema.parse(row.settings), context: candidateContextSchema.parse(row.context),
    startedAt: row.started_at, finishedAt: row.finished_at, history: row.history, plan: row.plan,
    evaluation: row.evaluations?.status ?? "none", result: row.evaluations?.result ?? null, evaluatedAt: row.evaluations?.updated_at ?? null,
    score: row.evaluations?.result?.feedback.overall_score ?? null };
}
function checked<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) {
    const code = ["DAY_LIMIT", "MONTH_LIMIT", "INVALID_LINK"].find(c => r.error!.message.includes(c));
    throw new PracticeError(code ?? "UNAVAILABLE");
  }
  return r.data;
}
const columns = "id,link_id,seeker_id,request_id,settings,context,history,plan,started_at,finished_at,evaluations(status,result,updated_at)";
/** 管理接続を受け取る。呼び出し元は必ず有効なリンクを毎回検証する。 */
export function createSupabasePracticeRepo(client: SupabaseClient): PracticeRepo {
  const repo: PracticeRepo = {
    async resolve(hash) {
      const l = checked(await client.from("practice_links").select("id,seeker_id,company_name,position,job_description,stage,style,duration_min,seekers!inner(name,occupation,career_summary,reason_for_change,user_profiles!inner(is_active))").eq("key_hash", hash).is("disabled_at", null).maybeSingle());
      if (!l) return null;
      // PostgRESTの多対一の結合はオブジェクト。生成型がないためここで境界を明示する。
      const s = l.seekers as unknown as { name: string; occupation: string; career_summary: string; reason_for_change: string; user_profiles: { is_active: boolean } };
      if (!s.user_profiles.is_active) return null;
      return { id: l.id, seekerId: l.seeker_id, name: s.name,
        settings: sessionSettingsSchema.parse({ stage: l.stage, style: l.style, durationMin: l.duration_min, interviewerModel: "opus", voiceId: "", interviewerName: "佐藤 健一", answerBy: "voice" }),
        context: candidateContextSchema.parse({ companyName: l.company_name, position: l.position || s.occupation, jobDescription: l.job_description, careerSummary: s.career_summary, reasonForChange: s.reason_for_change }) };
    },
    async list(linkId) {
      const result: PracticeSession[] = [];
      for (let offset = 0; ; offset += 100) {
        const rows = checked(await client.from("interview_sessions").select(columns).eq("link_id", linkId).order("started_at", { ascending: false }).order("id", { ascending: false }).range(offset,offset+99)) ?? [];
        result.push(...(rows as unknown as Row[]).map(session));
        if (rows.length < 100) return result;
      }
    },
    async get(linkId, id) {
      const row = checked(await client.from("interview_sessions").select(columns).eq("link_id", linkId).eq("id", id).maybeSingle());
      return row ? session(row as unknown as Row) : null;
    },
    async start(hash, requestId, answerBy, voiceId) {
      const target = await repo.resolve(hash); if (!target) throw new PracticeError("INVALID_LINK");
      const id = checked(await client.rpc("start_practice", { p_hash: hash, p_request: requestId, p_answer_by: answerBy, p_voice: voiceId }));
      const s = await repo.get(target.id, id); if (!s) throw new PracticeError("UNAVAILABLE"); return s;
    },
    async finish(linkId, id, history, plan) {
      return checked(await client.rpc("finish_practice", { p_link: linkId, p_session: id, p_history: history, p_plan: plan }));
    },
    async complete(linkId, id, result, failed) {
      if (!await repo.get(linkId,id)) return;
      checked(await client.from("evaluations").update({ status: failed ? "failed" : "done", result, error: failed ? "FEEDBACK_FAILED" : null }).eq("session_id", id).eq("status", "pending"));
    },
    async reopen(linkId, id, now = new Date()) {
      return checked(await client.rpc("reopen_evaluation", { p_link: linkId, p_session: id, p_stale_before: new Date(now.getTime() - STALE_EVALUATION_MS).toISOString() })) === true;
    },
  };
  return repo;
}
