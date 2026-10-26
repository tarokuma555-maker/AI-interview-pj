import { afterEach, expect, it, vi } from "vitest";
const tasks = vi.hoisted(() => [] as (() => Promise<void>)[]);
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => tasks.push(fn) }));
import { POST, GET } from "@/app/api/practice/route";
import { createMemoryRepo } from "@/lib/agent-data/memory-repo";
import { headers } from "@/features/interview/client/poc-api";
async function setup() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""); vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("AI_PROVIDER", "mock");
  const agent = createMemoryRepo({id:crypto.randomUUID(),role:"advisor",email:"a@example.com",displayName:"A"});
  const sid = await agent.createSeeker({name:"架空求職者",occupation:"看護師",careerSummary:"",reasonForChange:""});
  await agent.createLink(sid,{companyName:"架空病院",position:"",jobDescription:"",stage:"second",style:"standard",durationMin:15});
  const key = (await agent.listLinks(sid))[0].key;
  const code = `practice:${key}`;
  const post = (data: unknown) => POST(new Request("http://localhost/api/practice",{method:"POST",headers:headers(code),body:JSON.stringify(data)}));
  return { code,post };
}
afterEach(() => { vi.unstubAllEnvs(); tasks.length=0; });
it("応答前に会話を保存し、切断後に相当する後処理で評価を保存する", async () => {
  const {code,post} = await setup();
  const start = await post({action:"start",requestId:crypto.randomUUID(),answerBy:"text"});
  const {session} = await start.json();
  const finish = await post({action:"finish",sessionId:session.id,history:[{speaker:"candidate",text:"病棟で8年、看護師として働いてきました。",inputMode:"text"}],plan:null});
  expect(finish.status).toBe(202);
  expect((await finish.json()).session).toMatchObject({evaluation:"pending",finishedAt:expect.any(String)});
  expect(tasks).toHaveLength(1);
  await post({action:"finish",sessionId:session.id,history:[],plan:null});
  expect(tasks).toHaveLength(1);
  await tasks[0]();
  const result=await GET(new Request("http://localhost/api/practice",{headers:headers(`${code}:${session.id}`)})).then(r=>r.json());
  expect(result.session.evaluation).toBe("done");expect(result.session.history).toHaveLength(1);expect(result.session.result.feedback.overall_score).toEqual(expect.any(Number));
});
it("別のリンクの記録を取得・終了できない", async () => {
  const a=await setup(), b=await setup();
  const {session}=await a.post({action:"start",requestId:crypto.randomUUID(),answerBy:"text"}).then(r=>r.json());
  expect((await GET(new Request("http://localhost/api/practice",{headers:headers(`${b.code}:${session.id}`)}))).status).toBe(404);
  expect((await b.post({action:"finish",sessionId:session.id,history:[],plan:null})).status).toBe(404);
  expect(tasks).toHaveLength(0);
});
