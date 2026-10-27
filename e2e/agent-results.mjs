// エージェントが練習の一覧と結果・会話の記録を見る(設計 2026-10-27 4.1 ④、段階D)
import assert from "node:assert/strict";
import { BASE_URL, agentLogin, openPhone } from "./browser.mjs";

const agent = await openPhone("agent-results");
const { page: a, shot } = agent;
await agentLogin(a, "results-agent@example.com");
await a.getByRole("link", { name: "+ 求職者を追加", exact: true }).click();
await a.getByLabel("名前", { exact: true }).fill("結果テスト求職者");
await a.getByLabel("職種", { exact: true }).fill("看護師");
await a.getByRole("button", { name: "保存する", exact: true }).click();
await a.waitForURL(/\/seekers\/[a-f0-9-]+$/);
const detail = a.url();
await a.getByRole("link", { name: "+ 応募先を追加してリンクを作る" }).click();
await a.getByLabel("病院・会社の名前", { exact: true }).fill("結果テスト病院");
await a.getByRole("button", { name: "招待リンクを作る", exact: true }).click();
const url = await a.getByTestId("created-link-url").textContent();

// 求職者が文字で答える面接を1回終える
const seeker = await openPhone("agent-results-seeker", { micAllowed: false });
const s = seeker.page;
await s.goto(url);
await s.getByRole("button", { name: "文字で答える面接にする", exact: true }).click();
await s.getByRole("button", { name: "面接を始める", exact: true }).click();
await s.getByText("あなたの番です", { exact: true }).waitFor({ timeout: 30000 });
await s.locator("textarea").fill("内科病棟で8年間、患者さんの看護と後輩の指導を担当してきました。");
await s.getByRole("button", { name: "回答を送る", exact: true }).click();
await s.getByText("あなたの番です", { exact: true }).waitFor({ timeout: 30000 });
await s.getByRole("button", { name: "面接を終了", exact: true }).click();
await s.getByRole("button", { name: "終了する", exact: true }).click();
await s.getByText("次にやること", { exact: true }).waitFor({ timeout: 60000 });

// もう1回始めて、答える前に画面を閉じる(途中で終わった練習)
await s.getByRole("button", { name: "もう一度練習する", exact: true }).click();
await s.getByRole("button", { name: "文字で答える面接にする", exact: true }).click();
await s.getByRole("button", { name: "面接を始める", exact: true }).click();
await s.getByText("あなたの番です", { exact: true }).waitFor({ timeout: 30000 });
await seeker.finish();

// エージェント:②から④へ
await a.goto(detail);
await a.getByText("練習 2回", { exact: false }).waitFor();
await shot("seeker");
await a.getByRole("link", { name: "結果を見る", exact: true }).click();
await a.waitForURL(/\/links\/[a-f0-9-]+$/);
await a.getByText("途中で終わった練習", { exact: true }).waitFor();
const scored = a.getByRole("link", { name: /点$/ });
assert.equal(await scored.count(), 1);
assert.equal(await a.getByRole("link", { name: /途中で終わった練習/ }).count(), 0);
await shot("practices");

// 結果と会話の記録
await scored.click();
await a.waitForURL(/\/practices\/[a-f0-9-]+$/);
await a.getByText("次にやること", { exact: true }).waitFor();
await a.locator("summary", { hasText: "会話の記録" }).click();
await a.locator("details[open] li", { hasText: "内科病棟で8年間、患者さんの看護と後輩の指導を担当してきました。" }).waitFor();
const practiceUrl = a.url();
await shot("result");

// ほかのエージェントは、URL を直接開いても見られない
const other = await openPhone("agent-results-other");
await agentLogin(other.page, "results-other@example.com");
await other.page.goto(practiceUrl);
await other.page.getByText("この練習は見つかりません", { exact: true }).waitFor();
assert.equal(await other.page.getByText("結果テスト求職者").count(), 0);
assert.equal(await other.page.getByText("内科病棟で8年間").count(), 0);
await other.shot("not-found");
await other.finish();
await agent.finish();
console.log(`[agent-results] OK ${BASE_URL}`);
