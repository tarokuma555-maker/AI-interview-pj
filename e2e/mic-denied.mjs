// マイクの使用を断ったときに、直し方を出し、文字で答える面接に切り替えて最後まで進めるか
import { onboard, openPhone } from "./browser.mjs";

const { page, log, shot, finish } = await openPhone("mic-denied", { micAllowed: false });
await onboard(page, "介護職(介護福祉士など)");
await page.click("text=このまま始める");
await page.waitForSelector("text=マイクが使えません", { timeout: 30000 });
await shot("error");
await page.click("text=文字で答える面接にする");
await page.waitForSelector("text=文字で答える面接です", { timeout: 30000 });
await page.click("text=面接を始める");
await page.waitForSelector("text=あなたの番です", { timeout: 30000 });
const caption = await page.locator('p:has-text("面接官:")').innerText();
if (caption.includes("以上です")) throw new Error("文字で答える面接なのに「以上です」をお願いしています");
log("字幕: " + caption);
await page.fill("textarea", "特別養護老人ホームで5年間、介護福祉士として入居者の生活支援をしてきました。");
await page.click("text=回答を送る");
await page.waitForSelector("text=あなたの番です", { timeout: 30000 });
await page.click("text=面接を終了");
await page.click("text=終了する");
await page.waitForSelector("text=次にやること", { timeout: 60000 });
await shot("result");
await finish();
