import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "@/lib/agent-data/memory-repo";
import { createMemoryPracticeRepo } from "@/lib/practice-link/memory-repo";
import { hashLinkKey } from "@/lib/practice-link/key";
import { interviewAccess } from "@/lib/practice-link/access";
import { headers } from "@/features/interview/client/poc-api";
import { POST as turn } from "@/app/api/poc/turns/route";
import { mockQuestionPlan } from "@/lib/ai/mock";
import { POST as plan } from "@/app/api/poc/plan/route";
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("AI_PROVIDER", "mock");
  const repo = createMemoryRepo({ id: crypto.randomUUID(), role: "advisor", email: "a@example.com", displayName: "A" });
  const sid = await repo.createSeeker({ name: "架空求職者", occupation: "看護師", careerSummary: "登録した経歴", reasonForChange: "" });
  const lid = (await repo.createLink(sid,{ companyName: "登録した応募先", position: "外来", jobDescription: "登録した求人", stage: "second", style: "standard", durationMin: 15 }))!;
  const key = (await repo.listLinks(sid))[0].key;
  const practice = createMemoryPracticeRepo();
  return { repo,sid,lid,key,practice };
}
describe("招待キーと旧コードの境界", () => {
  it("キーは専用ヘッダーだけに入れ、URLや旧コードに入れない", () => {
    expect(headers("practice:abc:session")).toEqual({ "Content-Type": "application/json", "x-practice-link": "abc", "x-practice-session": "session" });
    expect(headers("legacy")).toMatchObject({ "x-poc-code": "legacy" });
  });
  it("開始前の会話、別リンクの練習、終了済みの練習を拒否する", async () => {
    const { key,practice,lid } = await setup(); const other = await setup();
    const req = (code: string) => new Request("http://localhost/api/poc/turns", { headers: headers(code) });
    expect((await interviewAccess(req(`practice:${key}`))).denied?.status).toBe(403);
    const s = await practice.start(hashLinkKey(key),crypto.randomUUID(),"text","");
    expect((await interviewAccess(req(`practice:${key}:${s.id}`))).denied).toBeNull();
    expect((await interviewAccess(req(`practice:${other.key}:${s.id}`))).denied?.status).toBe(401);
    await practice.finish(lid,s.id,[],null);
    expect((await interviewAccess(req(`practice:${key}:${s.id}`))).denied?.status).toBe(401);
  });
  it("担当者が止めたリンクを拒否し、旧コードを併記しても迂回できない", async () => {
    const { key,repo,sid,lid } = await setup(); vi.stubEnv("POC_ACCESS_CODE","test");
    await repo.setLinkDisabled(sid,lid,true);
    expect((await interviewAccess(new Request("http://localhost/api/poc/config", { headers: { ...headers(`practice:${key}`), "x-poc-code":"test" } }))).denied?.status).toBe(401);
  });
  it("保存済みの開始記録があっても最初の会話を始められる", async () => {
    const { key,practice } = await setup(); vi.stubEnv("GOOGLE_TTS_API_KEY", "");
    const s = await practice.start(hashLinkKey(key),crypto.randomUUID(),"text","");
    const res = await turn(new Request("http://localhost/api/poc/turns", { method: "POST", headers: headers(`practice:${key}:${s.id}`), body: JSON.stringify({
      kind:"start",settings:s.settings,context:s.context,plan:mockQuestionPlan(s.context),history:[],state:{startedAt:null,phase:"opening",noticesSent:[]},ttsProvider:"mock",reply:true,
    }) }));
    const events = (await res.text()).trim().split("\n").map(line => JSON.parse(line));
    expect(events.some(e => e.type === "error")).toBe(false);
    expect(events.some(e => e.type === "done")).toBe(true);
  });
  it("ブラウザが応募先を書き換えても、計画には登録内容を使う", async () => {
    const { key } = await setup();
    const res = await plan(new Request("http://localhost/api/poc/plan", { method:"POST", headers:headers(`practice:${key}`), body: JSON.stringify({ settings:{stage:"final",style:"strict",durationMin:30,interviewerModel:"sonnet",voiceId:"",answerBy:"text"},context:{companyName:"改ざん",position:"改ざん",jobDescription:"改ざん",careerSummary:"改ざん",reasonForChange:""} }) }));
    expect(res.status).toBe(200);
    const result = await res.json(); expect(result.plan.stt_keywords).toContain("登録した応募先"); expect(JSON.stringify(result)).not.toContain("改ざん");
  });
});
