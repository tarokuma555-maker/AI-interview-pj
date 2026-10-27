import { describe, expect, it } from "vitest";
import { createMemoryRepo, type MemoryData } from "@/lib/agent-data/memory-repo";
import { createMemoryPracticeRepo } from "@/lib/practice-link/memory-repo";
import { hashLinkKey } from "@/lib/practice-link/key";
import { quotaCode } from "@/lib/practice-link/snapshot";
import { canRetry, STALE_EVALUATION_MS } from "@/lib/practice-link/evaluate";
import { mockFeedback } from "@/lib/ai/mock";
async function setup(clock = () => new Date("2026-10-27T01:00:00Z")) {
  const store: MemoryData = { seekers: [], links: [], sessions: [] };
  const agent = createMemoryRepo({ id: "a", role: "advisor", email: "a@example.com", displayName: "a" },store);
  const sid = await agent.createSeeker({ name: "架空求職者", occupation: "看護師", careerSummary: "病棟8年", reasonForChange: "" });
  const input = { companyName: "架空病院", position: "外来", jobDescription: "求人", stage: "second" as const, style: "standard" as const, durationMin: 15 as const };
  const lid = (await agent.createLink(sid,input))!;
  const key = (await agent.listLinks(sid))[0].key;
  const practice = createMemoryPracticeRepo(store, clock);
  return { agent, sid, lid, hash: hashLinkKey(key), input, practice, store };
}
describe("招待面接の保存と上限", () => {
  it("停止・削除したリンクや違う鍵では開始できない", async () => {
    const { agent,sid,lid,hash,practice } = await setup();
    expect(await practice.resolve("wrong")).toBeNull();
    await agent.setLinkDisabled(sid,lid,true); expect(await practice.resolve(hash)).toBeNull();
    await expect(practice.start(hash,"1","text","")).rejects.toThrow("INVALID_LINK");
    await agent.setLinkDisabled(sid,lid,false); expect(await practice.resolve(hash)).not.toBeNull();
    await agent.deleteSeeker(sid); expect(await practice.resolve(hash)).toBeNull();
  });
  it("同時の開始を3回までにし、通信の再送では二重に数えない", async () => {
    const { practice, hash, store } = await setup();
    const results = await Promise.allSettled(Array.from({ length: 6 },(_,i) => practice.start(hash,String(i),"text","voice")));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
    const one = await practice.start(hash,"0","text","voice"); expect(one.id).toBe(store.sessions[0].id); expect(store.sessions).toHaveLength(3);
  });
  it("別の応募先でも同じ求職者の回数として数える", async () => {
    const { agent,practice,sid,input,hash } = await setup();
    await practice.start(hash,"1","text",""); await practice.start(hash,"2","text",""); await practice.start(hash,"3","text","");
    const other = await agent.createLink(sid,input); const key = (await agent.listLinks(sid)).find(l => l.id === other)!.key;
    await expect(practice.start(hashLinkKey(key),"4","text","")).rejects.toThrow("DAY_LIMIT");
  });
  it("開始時点の情報を保存し、終了を再送しても履歴を上書きしない", async () => {
    const { practice,agent,sid,lid,input,hash } = await setup();
    const s = await practice.start(hash,"1","text","");
    await agent.updateLink(sid,lid,{ ...input, companyName: "変更後" });
    expect((await practice.get(lid,s.id))!.context.companyName).toBe("架空病院");
    const history = [{ speaker: "candidate" as const, text: "看護師として病棟で8年働きました。", inputMode: "text" as const }];
    expect(await practice.finish("other",s.id,history,null)).toBe(false);
    expect(await practice.finish(lid,s.id,history,null)).toBe(true);
    expect(await practice.finish(lid,s.id,[],null)).toBe(false);
    const result = mockFeedback({ settings: s.settings,context: s.context,history,plan: null });
    await practice.complete(lid,s.id,result,false);
    expect((await practice.get(lid,s.id))!.history).toEqual(history);
    expect((await agent.listLinks(sid))[0]).toMatchObject({ practiceCount: 1, latestScore: result.feedback.overall_score });
    expect(await practice.get("other",s.id)).toBeNull();
  });
  it("日本時間の0時・月初を境界にする", () => {
    expect(quotaCode(Array(3).fill("2026-10-26T14:59:59Z"),new Date("2026-10-26T15:00:00Z"))).toBeNull();
    expect(quotaCode(Array(3).fill("2026-10-26T15:00:00Z"),new Date("2026-10-27T01:00:00Z"))).toBe("DAY_LIMIT");
    expect(quotaCode(Array(30).fill("2026-10-01T00:00:00Z"),new Date("2026-10-27T00:00:00Z"))).toBe("MONTH_LIMIT");
    expect(quotaCode(Array(30).fill("2026-10-31T14:59:59Z"),new Date("2026-10-31T15:00:00Z"))).toBeNull();
  });
});

describe("結果の作り直し(段階D)", () => {
  const history = [{ speaker: "candidate" as const, text: "病棟で8年働きました。", inputMode: "text" as const }];
  it("まとめられなかった練習は1回だけ作り直しの権利を取れ、別のリンクからは取れない", async () => {
    const { practice, lid, hash } = await setup();
    const s = await practice.start(hash,"1","text","");
    expect(await practice.reopen(lid,s.id)).toBe(false);
    await practice.finish(lid,s.id,history,null);
    await practice.complete(lid,s.id,null,true);
    expect((await practice.get(lid,s.id))!.evaluation).toBe("failed");
    expect(await practice.reopen("other",s.id)).toBe(false);
    expect(await practice.reopen(lid,s.id)).toBe(true);
    expect((await practice.get(lid,s.id))!.evaluation).toBe("pending");
    expect(await practice.reopen(lid,s.id)).toBe(false);
  });
  it("作成中のまま6分以上たった練習だけを、止まったものとして作り直せる", async () => {
    let now = new Date("2026-10-27T01:00:00Z");
    const { practice, lid, hash } = await setup(() => now);
    const s = await practice.start(hash,"1","text","");
    await practice.finish(lid,s.id,history,null);
    expect((await practice.get(lid,s.id))!.evaluatedAt).toBe(now.toISOString());
    now = new Date(now.getTime() + 5 * 60_000);
    expect(await practice.reopen(lid,s.id)).toBe(false);
    now = new Date(now.getTime() + 2 * 60_000);
    expect(await practice.reopen(lid,s.id)).toBe(true);
  });
  it("画面で作り直しのボタンを出すかの判断", () => {
    const at = new Date("2026-10-27T01:00:00Z");
    const ago = (ms: number) => new Date(at.getTime() - ms).toISOString();
    const finishedAt = ago(STALE_EVALUATION_MS * 2);
    expect(canRetry({ finishedAt, evaluation: "failed", evaluatedAt: ago(1000) }, at)).toBe(true);
    expect(canRetry({ finishedAt, evaluation: "pending", evaluatedAt: ago(5 * 60_000) }, at)).toBe(false);
    expect(canRetry({ finishedAt, evaluation: "pending", evaluatedAt: ago(7 * 60_000) }, at)).toBe(true);
    expect(canRetry({ finishedAt: null, evaluation: "failed", evaluatedAt: ago(1000) }, at)).toBe(false);
    expect(canRetry({ finishedAt, evaluation: "done", evaluatedAt: ago(7 * 60_000) }, at)).toBe(false);
  });
});
