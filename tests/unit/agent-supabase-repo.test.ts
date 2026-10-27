import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRepo } from "@/lib/agent-data/supabase-repo";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
const sid = "10000000-0000-4000-8000-000000000001", lid = "20000000-0000-4000-8000-000000000001";
const agent = { id: "30000000-0000-4000-8000-000000000001", role: "advisor" as const, email: "a@example.com", displayName: "A" };
const row = { id: sid, advisor_id: agent.id, name: "架空求職者", occupation: "看護師", career_summary: "経歴", reason_for_change: "", created_at: "2026-10-27", updated_at: "2026-10-27" };
const link = { id: lid, seeker_id: sid, company_name: "架空病院", position: "外来", job_description: "求人", stage: "second", style: "standard", duration_min: 15, disabled_at: null, created_at: "2026-10-27" };
const input = { companyName: "架空病院", position: "外来", jobDescription: "求人", stage: "second" as const, style: "standard" as const, durationMin: 15 as const };
function setup(responses: { body: unknown; status?: number }[], logFailure = false) {
  const calls: { url: URL; method: string; body: Record<string, unknown> | null }[] = [];
  const client = createClient("https://example.supabase.co", "test-publishable-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, init) => {
    calls.push({ url: new URL(String(url)), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    if (String(url).includes("/agent_access_logs")) return logFailure
      ? new Response(JSON.stringify({ message: "private detail", code: "42501" }), { status: 403 })
      : new Response(null, { status: 201 });
    const response = responses.shift(); if (!response) throw new Error("unexpected request");
    return new Response(JSON.stringify(response.body), { status: response.status ?? 200, headers: { "Content-Type": "application/json" } });
  } } });
  return { repo: createSupabaseRepo(client, agent), calls };
}
describe("Supabaseの読み書き(通信の形を確認。本物の接続ではない)", () => {
  it("求職者・リンク・評価の列を画面の形に変換する", async () => {
    const { repo } = setup([{ body: [row] }, { body: [link] }, { body: [
      { id: "s1", seeker_id: sid, link_id: lid, started_at: "2026-10-26", evaluations: { status: "done", result: { overall_score: 80 } } },
      { id: "s2", seeker_id: sid, link_id: lid, started_at: "2026-10-27", evaluations: { status: "failed", result: { overall_score: 99 } } },
    ] }]);
    expect(await repo.listSeekers()).toEqual([{ id: sid, name: row.name, occupation: row.occupation, linkCount: 1, latestScore: 80, latestAt: "2026-10-26" }]);
  });
  it("新規リンクは担当範囲の存在を確かめ、鍵のハッシュだけを送る", async () => {
    const { repo, calls } = setup([{ body: row }, { body: null }]);
    const id = await repo.createLink(sid, input);
    expect(calls[0].url.searchParams.get("id")).toBe(`eq.${sid}`);
    expect(calls[1].body).toEqual({ ...link, id, key_hash: hashLinkKey(linkKey(id!, linkSecret())), disabled_at: undefined, created_at: undefined });
    expect(calls[1].body).not.toHaveProperty("key");
  });
  it("リンクの編集・停止では求職者IDとリンクIDの両方で絞る", async () => {
    const { repo, calls } = setup([{ body: { id: lid } }, { body: { id: lid } }]);
    expect(await repo.updateLink(sid, lid, input)).toBe(true);
    expect(await repo.setLinkDisabled(sid, lid, true)).toBe(true);
    for (const c of calls) { expect(c.method).toBe("PATCH"); expect(c.url.searchParams.get("id")).toBe(`eq.${lid}`); expect(c.url.searchParams.get("seeker_id")).toBe(`eq.${sid}`); }
    expect(calls[1].body?.disabled_at).toEqual(expect.any(String));
  });
  it("RLSで見えない求職者へのリンク作成は行わない", async () => {
    const { repo, calls } = setup([{ body: null }]);
    expect(await repo.createLink(sid, input)).toBeNull(); expect(calls).toHaveLength(1);
  });
  it("不正なIDは問い合わせず、通信エラーは空の成功として扱わない", async () => {
    const { repo, calls } = setup([{ body: { message: "private database detail", code: "42501" }, status: 403 }]);
    expect(await repo.getSeeker("invalid")).toBeNull(); expect(calls).toHaveLength(0);
    await expect(repo.deleteSeeker(sid)).rejects.toThrow("保存先に接続できません");
  });
  it("練習の一覧は、担当のリンクかを確かめてから、求職者とリンクの両方で絞って読む", async () => {
    const { repo, calls } = setup([{ body: link }, { body: [
      { id: "s2", link_id: lid, seeker_id: sid, started_at: "2026-10-27T01:00:00Z", finished_at: "2026-10-27T01:10:00Z", evaluations: { status: "failed", result: null, updated_at: "2026-10-27T01:11:00Z" } },
      { id: "s1", link_id: lid, seeker_id: sid, started_at: "2026-10-26T01:00:00Z", finished_at: "2026-10-26T01:10:00Z", evaluations: { status: "done", result: { feedback: { overall_score: 72 } }, updated_at: "2026-10-26T01:11:00Z" } },
      { id: "s0", link_id: lid, seeker_id: sid, started_at: "2026-10-25T01:00:00Z", finished_at: null, evaluations: null },
    ] }]);
    expect(await repo.listPractices(sid, lid)).toEqual([
      { id: "s2", startedAt: "2026-10-27T01:00:00Z", finishedAt: "2026-10-27T01:10:00Z", score: null, status: "failed", retryable: true },
      { id: "s1", startedAt: "2026-10-26T01:00:00Z", finishedAt: "2026-10-26T01:10:00Z", score: 72, status: "done", retryable: false },
      { id: "s0", startedAt: "2026-10-25T01:00:00Z", finishedAt: null, score: null, status: "unfinished", retryable: false },
    ]);
    expect(calls[1].url.pathname).toContain("interview_sessions");
    expect(calls[1].url.searchParams.get("link_id")).toBe(`eq.${lid}`);
    expect(calls[1].url.searchParams.get("seeker_id")).toBe(`eq.${sid}`);
    expect(calls[1].url.searchParams.get("select")).not.toContain("history");
  });
  it("担当でないリンクの練習は読まない", async () => {
    const { repo, calls } = setup([{ body: null }]);
    expect(await repo.listPractices(sid, lid)).toBeNull(); expect(calls).toHaveLength(1);
    expect(await repo.getPractice(sid, "invalid", "s1")).toBeNull(); expect(calls).toHaveLength(1);
  });
  it("読む対象と本人IDだけを記録し、氏名・経歴・鍵・時刻を送らない", async () => {
    const { repo, calls } = setup([{ body: row }]);
    expect((await repo.getSeeker(sid))?.id).toBe(sid);
    expect(calls[1].url.pathname).toBe("/rest/v1/agent_access_logs");
    expect(calls[1].method).toBe("POST");
    expect(calls[1].body).toEqual([{ agent_id: agent.id, seeker_id: sid, session_id: null, action: "seeker_view" }]);
  });
  it("閲覧記録を書けなければ個人情報を返さず、内部の理由は出さない", async () => {
    const { repo } = setup([{ body: row }], true);
    await expect(repo.getSeeker(sid)).rejects.toThrow("保存先に接続できません");
  });
  it("結果の取得は内部の担当確認・一覧を重複記録せず、結果の1件だけ記録する", async () => {
    const sessionId = "40000000-0000-4000-8000-000000000001";
    const practice = { id: sessionId, started_at: "2026-10-27T01:00:00Z", finished_at: null, evaluations: null, history: [] };
    const { repo, calls } = setup([{ body: link }, { body: [practice] }, { body: practice }]);
    expect((await repo.getPractice(sid, lid, sessionId))?.id).toBe(sessionId);
    const logs = calls.filter(c => c.url.pathname.endsWith("/agent_access_logs"));
    expect(logs).toHaveLength(1);
    expect(logs[0].body).toEqual([{ agent_id: agent.id, seeker_id: sid, session_id: sessionId, action: "practice_view" }]);
  });
});
