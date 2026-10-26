// 製品版の先行版を、招待リンクから結果・記録の表示まで通しで動かす(設計書 14.2)
import { BASE_URL, onboard, openPhone } from "./browser.mjs";

const { page, log, shot, finish } = await openPhone("product");

// 招待なし・間違った招待
await page.goto(`${BASE_URL}/`);
await page.waitForSelector("text=招待リンクから開いてください");
await shot("no-invite");
await page.goto(`${BASE_URL}/join#wrong-code`);
await page.waitForSelector("text=この招待は使えません");
if (new URL(page.url()).hash) throw new Error("招待のコードが URL に残っています");
await shot("bad-invite");

// はじめての案内 → 準備 → 音と声の確認
await onboard(page, "看護師");
await shot("prepare");
await page.click("text=このまま始める");
await page.waitForSelector("text=音と声の確認", { timeout: 30000 });
await page.waitForSelector("text=声が届いています", { timeout: 20000 });
await page.click("text=テストの声を流す");
await page.waitForSelector("text=声は聞こえましたか", { timeout: 20000 });
await page.click("text=聞こえた");
await shot("check");

// 面接:「以上です」で回答が終わり、面接官が次を話す
await page.click("text=面接を始める");
await page.waitForSelector("text=あなたの番です", { timeout: 30000 });
await shot("room");
await page.waitForSelector("text=面接官が話しています", { timeout: 60000 });
log("「以上です」で回答が終わった");

// 面接中に上のリンクを押したら確認が出る(キャンセルすれば面接は続く)
let asked = false;
page.once("dialog", (dialog) => {
  asked = true;
  void dialog.dismiss();
});
await page.click("header >> text=困ったとき");
await page.waitForTimeout(500);
if (!asked || !page.url().endsWith("/interview")) throw new Error("面接中に移動する前の確認が出ませんでした");

// 終了 → 結果 → ホーム・記録
await page.click("text=面接を終了");
await page.click("text=終了する");
await page.waitForSelector("text=次にやること", { timeout: 60000 });
await shot("result");
await page.click("text=ホームに戻る");
await page.waitForSelector("text=今日も練習しましょう");
await shot("home");
await page.click("text=練習の記録");
await page.locator("a[href^='/history/']").first().click();
await page.waitForSelector("text=この記録を削除");
await shot("history-detail");

// 応募先・経歴・設定・ヘルプ
await page.goto(`${BASE_URL}/companies`);
await page.click("text=応募先を追加");
await page.fill("input >> nth=0", "サンプル総合病院");
await page.fill("input >> nth=1", "看護師(内科病棟)");
await page.click("text=保存する");
await page.waitForSelector("text=サンプル総合病院");
await shot("companies");
for (const path of ["/profile", "/settings", "/help#mic"]) {
  await page.goto(`${BASE_URL}${path}`);
  await shot(path.replace(/\W/g, ""));
}
await page.goto(`${BASE_URL}/interview`);
await page.click("text=内容を変える");
await page.click("label:has-text('サンプル総合病院')");
await shot("prepare-edit");
await finish();
