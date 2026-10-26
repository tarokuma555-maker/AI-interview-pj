// 評価がない練習の記録から、結果をまとめ直す(要件 F-08-2。設計書 14.2)
import { BASE_URL, onboard, openPhone } from "./browser.mjs";

const { page, shot, finish } = await openPhone("history-retry");
await onboard(page, "看護師");

// 面接直後に評価の作成に失敗した記録(新しいもの)と、評価のある記録(古いもの)を用意する
await page.evaluate(() => {
  const session = (id, finishedAt, feedback) => ({
    id,
    startedAt: finishedAt,
    finishedAt,
    choice: { companyId: null, stage: "first", style: "gentle", durationMin: 5, answerBy: "voice" },
    companyName: "",
    position: "看護師",
    history: [
      { speaker: "interviewer", text: "自己紹介をお願いします。" },
      { speaker: "candidate", text: "看護師として8年、内科病棟で働いてきました。以上です。", inputMode: "voice", speechMs: 6000, charsPerMinute: 300 },
    ],
    feedback,
  });
  const old = JSON.parse(localStorage.getItem("ai-mensetsu:sessions") ?? "[]");
  localStorage.setItem("ai-mensetsu:sessions", JSON.stringify([session("no-feedback", "2026-10-26T10:00:00Z", null), ...old]));
});

await page.goto(`${BASE_URL}/history/no-feedback`);
await page.waitForSelector("text=まだまとまっていません");
await shot("before");
await page.click("text=結果をまとめる");
await page.waitForSelector("text=次にやること", { timeout: 60000 });
await shot("after");

// 記録の並び順は変わらず、一覧に点数が出る
await page.goto(`${BASE_URL}/history`);
const first = await page.locator("a[href^='/history/']").first().getAttribute("href");
if (first !== "/history/no-feedback") throw new Error(`記録の並び順が変わりました: ${first}`);
if (await page.locator("text=評価なし").count()) throw new Error("一覧に「評価なし」が残っています");
await shot("list");
await finish();
