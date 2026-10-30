import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { BASE_URL, agentLogin, openPhone } from "./browser.mjs";
const agent = await openPhone("practice-agent");
await agentLogin(agent.page,"practice-agent@example.com");
await agent.page.getByRole("link",{name:"+ 求職者を追加",exact:true}).click();
await agent.page.getByLabel("名前",{exact:true}).fill("招待テスト求職者");
await agent.page.getByLabel("職種",{exact:true}).fill("看護師");
await agent.page.getByRole("button",{name:"保存する",exact:true}).click();
await agent.page.waitForURL(/\/seekers\/[a-f0-9-]+$/);
const detail = agent.page.url();
await agent.page.getByRole("link",{name:"+ 応募先を追加してリンクを作る"}).click();
await agent.page.getByLabel("病院・会社の名前",{exact:true}).fill("招待テスト病院");
await agent.page.getByRole("button",{name:"招待リンクを作る",exact:true}).click();
const url = await agent.page.getByTestId("created-link-url").textContent();
const key = url.split("#")[1];
const visitor = await openPhone("practice-link",{micAllowed:false});
const {page,shot} = visitor;
page.on("response", async response => {
  if (response.status() >= 400 && new URL(response.url()).pathname.startsWith("/api/")) {
    const body = await response.json().catch(() => null);
    console.log("practice request failed", new URL(response.url()).pathname, response.status(), body?.error?.code);
  }
});
await page.goto(`${BASE_URL}/i`);
await page.getByText(/この招待リンクは使えません/).waitFor();
await shot("invalid-link");
await page.goto(url);
await page.getByText("練習の結果は、担当のエージェントにも共有されます。録音データは保存しません。",{exact:true}).waitFor();
assert.equal(await page.context().cookies().then(c=>c.some(x=>x.name==="agent-dev-session")),false);
await shot("intro");
// 文字で答える面接のボタンは出さない(2026-10-28 依頼者の決定)。マイクが使えないときは直し方と「もう一度試す」だけ
assert.equal(await page.getByRole("button",{name:"文字で答える面接にする"}).count(),0);
await page.getByRole("button",{name:"音と声を確認する",exact:true}).click();
await page.getByRole("heading",{name:"マイクが使えません",exact:true}).waitFor();
await page.getByRole("button",{name:"もう一度試す",exact:true}).waitFor();
assert.equal(await page.getByRole("button",{name:/文字で答える/}).count(),0);
await shot("mic-denied");
// マイクが使える端末で、声で答える面接(テスト用のマイク音声。模擬の聞き取りは「以上です」で終わる)
const voice = await openPhone("practice-voice");
const v = voice.page;
await v.goto(url);
await v.getByRole("button",{name:"音と声を確認する",exact:true}).click();
await v.getByText("✓ 声が届いています",{exact:true}).waitFor({timeout:20000});
assert.equal(await v.getByRole("button",{name:/文字で答える/}).count(),0);
await voice.shot("check");
// 機器確認の途中に担当者が直しても、開始時点の情報と質問計画を使う。
await agent.page.goto(detail);
await agent.page.getByRole("link",{name:"内容修正",exact:true}).click();
await agent.page.getByLabel("職種・配属先",{exact:true}).fill("確認中に変更した職種");
await agent.page.getByRole("button",{name:"保存する",exact:true}).click();
await agent.page.getByText("確認中に変更した職種",{exact:true}).waitFor();
await v.getByRole("button",{name:"面接を始める",exact:true}).click();
await v.getByText("あなたの番です",{exact:true}).waitFor({timeout:30000}).catch(async e => { await voice.shot("turn-failed"); console.log(await v.locator("main").innerText()); throw e; });
await v.getByText("面接官が話しています",{exact:true}).waitFor({timeout:60000});
await voice.shot("voice-answer");
await v.getByRole("button",{name:"面接を終了",exact:true}).click();
await v.getByRole("button",{name:"終了する",exact:true}).click();
// 保存と結果づくりの間は、動きのある案内を出し、会話の記録は閉じておく(2026-10-28 依頼者の要望)
const waiting = v.getByTestId("result-waiting");
await waiting.waitFor({timeout:10000});
assert.equal(await waiting.getAttribute("aria-busy"),"true");
assert.equal(await v.locator("details[open]").count(),0,"会話の記録は閉じた状態で出す");
await voice.shot("waiting");
await v.getByText("次にやること",{exact:true}).waitFor({timeout:60000});
await voice.shot("result");
const auth={"x-practice-link":key};
const data=await page.request.get(`${BASE_URL}/api/practice`,{headers:auth}).then(r=>r.json());
assert.equal(data.sessions.length,1); assert.equal(data.sessions[0].evaluation,"done");
assert.equal(data.sessions[0].context.companyName,"招待テスト病院");
assert.equal(data.sessions[0].settings.stage,"second");
assert.equal(data.sessions[0].settings.answerBy,"voice");
assert(data.sessions[0].history.some(t=>t.speaker==="candidate" && t.inputMode==="voice"));
assert.equal(data.sessions[0].context.position,"確認中に変更した職種");
assert(data.sessions[0].plan.stt_keywords.includes("確認中に変更した職種"));
const first=data.sessions[0];
// 同じ終了を再送しても会話を消さない。
await page.request.post(`${BASE_URL}/api/practice`,{headers:auth,data:{action:"finish",sessionId:first.id,history:[],plan:null}});
await v.reload();
await v.getByRole("button",{name:"結果を見る",exact:true}).click();
await v.getByText("次にやること",{exact:true}).waitFor();
await voice.shot("reopened");
await v.getByRole("button",{name:"戻る",exact:true}).click();
// 2回目:もう一度練習できる
await v.getByRole("button",{name:"音と声を確認する",exact:true}).click();
await v.getByText("✓ 声が届いています",{exact:true}).waitFor({timeout:20000});
await v.getByRole("button",{name:"面接を始める",exact:true}).click();
await v.getByText("あなたの番です",{exact:true}).waitFor({timeout:30000});
await voice.shot("second-practice");
await voice.finish();
// 3回目は開始だけ(同じ開始の再送は二重に数えず、4回目は1日の上限)
const third=await page.request.post(`${BASE_URL}/api/practice`,{headers:auth,data:{action:"start",requestId:randomUUID(),answerBy:"voice"}}).then(r=>r.json());
const duplicate=await page.request.post(`${BASE_URL}/api/practice`,{headers:auth,data:{action:"start",requestId:third.session.requestId,answerBy:"voice"}}).then(r=>r.json());
assert.equal(third.session.id,duplicate.session.id);
const denied=await page.request.post(`${BASE_URL}/api/practice`,{headers:auth,data:{action:"start",requestId:randomUUID(),answerBy:"voice"}});
assert.equal(denied.status(),429); assert.equal((await denied.json()).error.code,"DAY_LIMIT");
await agent.page.goto(detail);
await agent.page.getByText(/練習 3回・最新/).waitFor();
await agent.shot("practice-count");
await agent.page.getByRole("button",{name:"URL停止",exact:true}).click();
await agent.page.getByText("停止中",{exact:true}).waitFor();
await page.reload(); await page.getByText(/この招待リンクは使えません/).waitFor();
await shot("disabled-link");
await visitor.finish(); await agent.finish();
