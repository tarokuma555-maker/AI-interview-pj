import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseRepo } from "@/lib/agent-data/supabase-repo";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
const sid = "10000000-0000-4000-8000-000000000001", lid = "20000000-0000-4000-8000-000000000001";
const agent = { id: "30000000-0000-4000-8000-000000000001", role: "advisor" as const, email: "a@example.com", displayName: "A" };
const row = { id: sid, advisor_id: agent.id, name: "架空求職者", occupation: "看護師", career_summary: "経歴", reason_for_change: "", created_at: "2026-10-27", updated_at: "2026-10-27" };
const link = { id: lid, seeker_id: sid, company_name: "架空病院", position: "外来", job_description: "求人", stage: "second", style: "standard", duration_min: 15, disabled_at: null, created_at: "2026-10-27" };
const input = { companyName: "架空病院", position: "外来", jobDescription: "求人", stage: "second" as const, style: "standard" as const, durationMin: 15 as const };
function setup(responses: { body: unknown; status?: number }[]) {
  const calls: { url: URL; method: string; body: Record<string, unknown> | null }[] = [];
  const client = createClient("https://example.supabase.co", "test-publishable-key", { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, init) => {
    calls.push({ url: new URL(String(url)), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
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
});
