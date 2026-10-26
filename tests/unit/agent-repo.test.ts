import { describe, expect, it } from "vitest";
import { createMemoryRepo, type MemoryData } from "@/lib/agent-data/memory-repo";
import { summarizeSeekers, summarizeLinks } from "@/lib/agent-data/summary";
import { hashLinkKey, linkKey, linkSecret } from "@/lib/practice-link/key";
import type { Agent } from "@/lib/auth/types";
import type { LinkInput } from "@/lib/agent-data/schemas";
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
