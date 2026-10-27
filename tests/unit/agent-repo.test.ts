import { describe, expect, it } from "vitest";
import { createMemoryRepo, type MemoryData } from "@/lib/agent-data/memory-repo";
import { summarizeSeekers, summarizeLinks } from "@/lib/agent-data/summary";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
import type { Agent } from "@/lib/auth/types";
import type { LinkInput } from "@/lib/agent-data/schemas";
import { createMemoryPracticeRepo } from "@/lib/practice-link/memory-repo";
import { mockFeedback } from "@/lib/ai/mock";
const agent = (id: string, role: Agent["role"] = "advisor"): Agent => ({ id, role, email: `${id}@example.com`, displayName: id });
const input = { name: "テスト求職者", occupation: "看護師", careerSummary: "病棟8年", reasonForChange: "" };
const target: LinkInput = { companyName: "架空病院", position: "看護師", jobDescription: "", stage: "second", style: "standard", durationMin: 15 };
function setup() {
  const store: MemoryData = { seekers: [], links: [], sessions: [] };
  return { store, a: createMemoryRepo(agent("a"), store), b: createMemoryRepo(agent("b"), store), admin: createMemoryRepo(agent("admin", "admin"), store) };
}
describe("担当の求職者とリンク", () => {
  it("他の担当者は読む・作る・直す・消す・停止することができない", async () => {
    const { a, b } = setup(); const id = await a.createSeeker(input), lid = (await a.createLink(id, target))!;
    expect(await a.listSeekers()).toHaveLength(1); expect(await b.listSeekers()).toEqual([]);
    expect(await b.getSeeker(id)).toBeNull(); expect(await b.updateSeeker(id, input)).toBe(false);
    expect(await b.deleteSeeker(id)).toBe(false); expect(await b.listLinks(id)).toEqual([]);
    expect(await b.createLink(id, target)).toBeNull(); expect(await b.getLink(id, lid)).toBeNull();
    expect(await b.updateLink(id, lid, target)).toBe(false); expect(await b.setLinkDisabled(id, lid, true)).toBe(false);
    expect((await a.listLinks(id))[0].disabled).toBe(false);
  });
  it("リンクの編集・停止・再開で鍵を変えず、ハッシュ以外を保存しない", async () => {
    const { a, store } = setup(); const sid = await a.createSeeker(input), lid = (await a.createLink(sid, target))!;
    const key = linkKey(lid, linkSecret());
    expect(store.links[0].keyHash).toBe(hashLinkKey(key)); expect(store.links[0]).not.toHaveProperty("key");
    expect((await a.listLinks(sid))[0].key).toBe(key);
    await a.updateLink(sid, lid, { ...target, position: "外来" });
    expect((await a.listLinks(sid))[0]).toMatchObject({ position: "外来", key });
    await a.setLinkDisabled(sid, lid, true); expect((await a.listLinks(sid))[0]).toMatchObject({ disabled: true, key: "" });
    await a.setLinkDisabled(sid, lid, false); expect((await a.listLinks(sid))[0]).toMatchObject({ disabled: false, key });
  });
  it("同じ担当でも別の求職者とリンクの組合せを受け付けない", async () => {
    const { a } = setup(); const one = await a.createSeeker(input), two = await a.createSeeker(input), lid = (await a.createLink(one, target))!;
    expect(await a.getLink(two, lid)).toBeNull(); expect(await a.updateLink(two, lid, target)).toBe(false); expect(await a.setLinkDisabled(two, lid, true)).toBe(false);
  });
  it("管理者は全担当を見られ、削除は対象の記録だけに連動する", async () => {
    const { a, b, admin, store } = setup(); const sid = await a.createSeeker(input), other = await b.createSeeker(input), lid = (await a.createLink(sid, target))!;
    await b.createLink(other, target); store.sessions.push({ id: "s", seekerId: sid, linkId: lid, startedAt: "2026-10-27", score: 80 });
    expect(await admin.listSeekers()).toHaveLength(2); expect(await admin.getSeeker(sid)).not.toBeNull();
    expect(await a.deleteSeeker(sid)).toBe(true); expect(store.sessions).toEqual([]); expect(store.links).toHaveLength(1); expect(store.seekers[0].id).toBe(other);
  });
  it("新しい未評価の練習があっても、最新の評価済みの点数と日付を出す", async () => {
    const { a, store } = setup(); const sid = await a.createSeeker(input), lid = (await a.createLink(sid, target))!;
    expect((await a.listSeekers())[0]).toMatchObject({ linkCount: 1, latestScore: null, latestAt: null });
    store.sessions.push(...[60, 80, null].map((score, i) => ({ id: `${i}`, seekerId: sid, linkId: lid, startedAt: `2026-10-${25+i}`, score })));
    expect(summarizeSeekers(store.seekers, store.links, store.sessions)[0]).toMatchObject({ latestScore: 80, latestAt: "2026-10-26" });
    expect(summarizeLinks(store.links, store.sessions, () => "key")[0]).toMatchObject({ practiceCount: 3, latestScore: 80 });
  });
});

describe("練習の一覧と結果(段階D)", () => {
  async function practices() {
    const { store, a, b } = setup();
    const sid = await a.createSeeker(input), lid = (await a.createLink(sid, target))!;
    const other = (await a.createLink(await a.createSeeker(input), target))!;
    const hash = hashLinkKey((await a.listLinks(sid))[0].key);
    let now = new Date("2026-10-20T01:00:00Z");
    const practice = createMemoryPracticeRepo(store, () => now);
    const history = [{ speaker: "candidate" as const, text: "病棟で8年働きました。", inputMode: "text" as const }];
    const day = async (n: number) => { now = new Date(Date.UTC(2026, 9, 20 + n, 1)); };
    const finished = async (n: number) => { await day(n); const s = await practice.start(hash, String(n), "text", ""); await practice.finish(lid, s.id, history, null); return s; };
    const done = await finished(0);
    const result = mockFeedback({ settings: done.settings, context: done.context, history, plan: null });
    await practice.complete(lid, done.id, result, false);
    const failed = await finished(1); await practice.complete(lid, failed.id, null, true);
    const noAnswers = await finished(2); await practice.complete(lid, noAnswers.id, null, false);
    const preparing = await finished(3);
    await day(4); const unfinished = await practice.start(hash, "4", "text", "");
    return { a, b, sid, lid, other, ids: { done: done.id, failed: failed.id, noAnswers: noAnswers.id, preparing: preparing.id, unfinished: unfinished.id }, score: result.feedback.overall_score };
  }

  it("新しい順に、状態と点数、作り直せるかを出す", async () => {
    const { a, sid, lid, ids, score } = await practices();
    const list = (await a.listPractices(sid, lid))!;
    expect(list.map((p) => [p.id, p.status, p.score, p.retryable])).toEqual([
      [ids.unfinished, "unfinished", null, false],
      [ids.preparing, "preparing", null, true],
      [ids.noAnswers, "no_answers", null, false],
      [ids.failed, "failed", null, true],
      [ids.done, "done", score, false],
    ]);
  });

  it("結果と会話の記録、前回(結果が出た1つ前)の点数を出す", async () => {
    const { a, sid, lid, ids, score } = await practices();
    const done = (await a.getPractice(sid, lid, ids.done))!;
    expect(done.result?.feedback.overall_score).toBe(score);
    expect(done.history).toHaveLength(1);
    expect(done.previousScore).toBeNull();
    expect((await a.getPractice(sid, lid, ids.preparing))!.previousScore).toBe(score);
  });

  it("ほかの担当者や、求職者とリンクの組み合わせが違う場合は見つからない", async () => {
    const { a, b, sid, lid, other, ids } = await practices();
    expect(await b.listPractices(sid, lid)).toBeNull();
    expect(await b.getPractice(sid, lid, ids.done)).toBeNull();
    expect(await a.listPractices(sid, other)).toBeNull();
    expect(await a.getPractice(sid, other, ids.done)).toBeNull();
  });
});
