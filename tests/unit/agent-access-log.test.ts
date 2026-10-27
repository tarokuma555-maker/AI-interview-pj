import { describe, expect, it } from "vitest";
import { createMemoryRepo, type MemoryData } from "@/lib/agent-data/memory-repo";
import { createMemoryPracticeRepo } from "@/lib/practice-link/memory-repo";
import { hashLinkKey } from "@/lib/practice-link/key";

describe("担当者の閲覧記録", () => {
  it("一覧・編集用情報・応募先・結果の提供を記録し、他担当の拒否は成功として残さない", async () => {
    const store: MemoryData = { seekers: [], links: [], sessions: [], accessLogs: [] };
    const a = createMemoryRepo({ id: "a", role: "advisor", email: "a@example.com", displayName: "A" }, store);
    const b = createMemoryRepo({ id: "b", role: "advisor", email: "b@example.com", displayName: "B" }, store);
    const sid = await a.createSeeker({ name: "記録に入れてはいけない氏名", occupation: "", careerSummary: "秘密の経歴", reasonForChange: "" });
    const lid = (await a.createLink(sid, { companyName: "架空", position: "", jobDescription: "", stage: "first", style: "standard", durationMin: 5 }))!;
    expect(store.accessLogs).toEqual([]);
    const links = await a.listLinks(sid);
    const p = await createMemoryPracticeRepo(store).start(hashLinkKey(links[0].key), "request", "text", "");
    store.accessLogs = [];
    await a.listSeekers(); await a.getSeeker(sid); await a.listLinks(sid); await a.getLink(sid, lid);
    await a.listPractices(sid, lid); await a.getPractice(sid, lid, p.id);
    expect(store.accessLogs.map(l => l.action)).toEqual(["seeker_view", "seeker_view", "seeker_view", "seeker_view", "practice_list", "practice_view"]);
    expect(store.accessLogs[5]).toEqual({ agentId: "a", seekerId: sid, sessionId: p.id, action: "practice_view", createdAt: expect.any(String) });
    for (const entry of store.accessLogs) expect(Object.keys(entry).sort()).toEqual(["action", "agentId", "createdAt", "seekerId", "sessionId"]);
    await b.listSeekers(); await b.getSeeker(sid); await b.getLink(sid, lid); await b.listLinks(sid);
    await b.listPractices(sid, lid); await b.getPractice(sid, lid, p.id);
    await a.getPractice(sid, lid, "missing");
    expect(store.accessLogs).toHaveLength(6);
    await a.deleteSeeker(sid);
    expect(store.accessLogs).toHaveLength(6);
  });
});
