// 本物の Supabase につないだ環境(手元・本番)で、エージェントのログインから求職者の練習、結果の閲覧までを通しで確かめる(設計 2026-10-27 9章 段階E)。
// メールは送らない(送信の上限を使わない)。確認用のエージェントを2人作り、管理用のキーで作ったログイン用リンクで入る。
// 終わったら、確認用の求職者(リンク・練習・評価も)とエージェントを消す。
//
// 使い方(e2e フォルダーで): BASE_URL=<確かめる URL> NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase-smoke.mjs
//   KEEP=1 を付けると、確認用のデータを消さずに残す
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { BASE_URL, openPhone } from "./browser.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now();
const emails = [`smoke-a-${stamp}@example.com`, `smoke-b-${stamp}@example.com`];
const created = [];
const opened = [];
async function phone(...args) { const result = await openPhone(...args); opened.push(result); return result; }

async function agentLoginByLink(page, email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  await page.goto(`${BASE_URL}/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`);
  await page.waitForURL(/\/agent$/);
}

try {
  for (const email of emails) {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    created.push(data.user.id);
  }

  // エージェント A:ログイン → 求職者 → 応募先とリンク
  const agent = await phone("smoke-agent");
  const a = agent.page;
  await agentLoginByLink(a, emails[0]);
  await a.getByText("担当の求職者", { exact: true }).waitFor();
  await a.getByRole("link", { name: "+ 求職者を追加", exact: true }).click();
  await a.getByLabel("名前", { exact: true }).fill("確認用の求職者(自動で削除)");
  await a.getByLabel("職種", { exact: true }).fill("看護師");
  await a.getByLabel("経歴", { exact: true }).fill("内科病棟で8年。後輩の指導も担当");
  await a.getByRole("button", { name: "保存する", exact: true }).click();
  await a.waitForURL(/\/seekers\/[a-f0-9-]+$/);
  const detail = a.url();
  await a.getByRole("link", { name: "+ 応募先を追加してリンクを作る" }).click();
  await a.getByLabel("病院・会社の名前", { exact: true }).fill("確認用病院");
  await a.getByLabel("職種・配属先", { exact: true }).fill("病棟看護師");
  await a.getByRole("button", { name: "招待リンクを作る", exact: true }).click();
  const url = await a.getByTestId("created-link-url").textContent();
  assert.match(url, /\/i#[A-Za-z0-9_-]{22}$/);
  await agent.shot("link");
  console.log("[smoke] エージェントのログイン・求職者と招待リンクの作成 OK");

  // 求職者:リンク → 文字で答える面接 → 結果
  const voiceMode = process.env.SMOKE_VOICE === "1";
  const seeker = await phone("smoke-seeker", { micAllowed: voiceMode });
  const s = seeker.page;
  let recognized = 0, speechBytes = 0;
  const audioChecks = [];
  s.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (response.ok() && path === "/api/poc/stt") recognized++;
    if (response.ok() && path === "/api/poc/tts") audioChecks.push(response.body().then(body => { speechBytes += body.length; }));
  });
  await s.goto(url);
  await s.getByText("練習の結果は、担当のエージェントにも共有されます。録音データは保存しません。", { exact: true }).waitFor({ timeout: 30000 });
  await s.getByRole("button", { name: voiceMode ? "音と声を確認する" : "文字で答える面接にする", exact: true }).click();
  if (voiceMode) {
    await s.getByText("✓ 声が届いています", { exact: true }).waitFor({ timeout: 30000 });
    await s.getByRole("button", { name: "テストの声を流す", exact: true }).click();
    await s.getByText("声は聞こえましたか?", { exact: true }).waitFor({ timeout: 60000 });
    // 人が聞いたことにはせず、レスポンスの音声データを後で検証する。
  }
  const voiceAnswer = voiceMode ? s.waitForResponse(response => {
    if (new URL(response.url()).pathname !== "/api/poc/turns" || response.request().method() !== "POST") return false;
    const body = response.request().postDataJSON();
    return body.kind === "answer" && body.answer?.inputMode === "voice";
  }, { timeout: 180000 }) : null;
  // 待機中に別の確認が失敗しても、未処理のPromise拒否を残さない。
  if (voiceAnswer) void voiceAnswer.catch(() => {});
  await s.getByRole("button", { name: "面接を始める", exact: true }).click({ timeout: 60000 });
  console.log("[smoke] 面接開始 OK");
  await s.getByText("あなたの番です", { exact: true }).waitFor({ timeout: 90000 });
  if (voiceMode) {
    const response = await voiceAnswer;
    assert(response?.ok(), "音声回答の会話が受理されている");
    await response.finished();
    await s.getByText("あなたの番です", { exact: true }).waitFor({ timeout: 90000 });
    console.log("[smoke] 音声回答後の応答 OK");
  } else {
    await s.locator("textarea").fill("内科病棟で8年間、患者さんの看護と後輩の指導を担当してきました。急性期の経験を活かしたいと考えています。");
    await s.getByRole("button", { name: "回答を送る", exact: true }).click();
    await s.getByText("あなたの番です", { exact: true }).waitFor({ timeout: 90000 });
  }
  await s.getByRole("button", { name: "面接を終了", exact: true }).click();
  await s.getByRole("button", { name: "終了する", exact: true }).click();
  console.log("[smoke] 終了・結果待ち");
  await s.getByText("次にやること", { exact: true }).waitFor({ timeout: 300000 });
  await seeker.shot("result");
  if (voiceMode) {
    const response = await s.request.get(`${BASE_URL}/api/practice`, { headers: { "x-practice-link": new URL(url).hash.slice(1) } });
    assert.equal(response.status(), 200);
    const saved = (await response.json()).sessions[0];
    assert.equal(saved.settings.answerBy, "voice");
    assert(saved.history.some(t => t.speaker === "candidate" && t.inputMode === "voice" && t.text.length > 5));
    await Promise.all(audioChecks);
    assert(recognized > 0, "音声の文字化に成功している");
    assert(speechBytes > 100, "面接官の音声が生成されている");
    console.log("[smoke] 本物の音声認識・音声生成・音声回答の保存 OK（録音済みの合成音声入力、スマホ実機ではない）");
  }
  await seeker.finish();
  console.log("[smoke] 求職者のリンクからの面接と結果 OK");

  // エージェント A:④と結果
  await a.goto(detail);
  await a.getByRole("link", { name: "結果を見る", exact: true }).click();
  await a.getByRole("link", { name: /点$/ }).click();
  await a.getByText("次にやること", { exact: true }).waitFor();
  const practiceUrl = a.url();
  await agent.shot("agent-result");
  const sessionId = new URL(practiceUrl).pathname.split("/").at(-1);
  const logCount = async () => {
    const { count, error } = await admin.from("agent_access_logs").select("id", { count: "exact", head: true }).eq("agent_id", created[0]).eq("session_id", sessionId).eq("action", "practice_view");
    if (error) throw error;
    return count;
  };
  const initialLogs = await logCount(); assert(initialLogs > 0);
  await a.reload(); await a.getByText("次にやること", { exact: true }).waitFor();
  assert(await logCount() > initialLogs);
  console.log("[smoke] 結果の閲覧・再読み込みの記録 OK");
  console.log("[smoke] エージェントの結果の閲覧 OK");

  // エージェント B:A の求職者・練習は見えない(RLS)
  const other = await openPhone("smoke-other");
  await agentLoginByLink(other.page, emails[1]);
  await other.page.goto(detail);
  await other.page.getByText("この求職者は見つかりません", { exact: true }).waitFor();
  await other.page.goto(practiceUrl);
  await other.page.getByText("この練習は見つかりません", { exact: true }).waitFor();
  assert.equal(await other.page.getByText("確認用の求職者").count(), 0);
  await other.finish();
  console.log("[smoke] ほかのエージェントからは見えない OK");

  if (!process.env.KEEP) {
    await a.goto(detail);
    await a.getByRole("button", { name: "この求職者を削除", exact: true }).click();
    await a.getByRole("button", { name: "削除する", exact: true }).click();
    await a.waitForURL(/\/agent$/);
  }
  await agent.finish();
  console.log("[smoke] OK");
} finally {
  if (!process.env.KEEP) {
    // 確認用のエージェントの求職者が残っていたら消してから、エージェントを消す
    for (const id of created) {
      await admin.from("seekers").delete().eq("advisor_id", id);
      await admin.auth.admin.deleteUser(id);
      // 合成データを使ったこの試験の記録だけを、管理用の接続で掃除する。
      await admin.from("agent_access_logs").delete().eq("agent_id", id);
    }
  }
  for (const browser of opened) await browser.page.context().browser()?.close();
}
