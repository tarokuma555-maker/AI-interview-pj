// 公開入口と旧招待の終了案内。新方式の面接本体は practice-link.mjs で確認する。
import assert from "node:assert/strict";
import { BASE_URL, openPhone } from "./browser.mjs";

const { page, shot, finish } = await openPhone("release-entry");
const privacyTitle = "個人情報・練習データの取り扱い";
const apiRequests = [];
page.on("request", request => {
  if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.url());
});

try {
  await page.goto(`${BASE_URL}/`);
  await page.getByRole("heading", { name: "AI面接練習", exact: true }).waitFor();
  await page.getByRole("heading", { name: "面接を練習する方へ", exact: true }).waitFor();
  const staff = page.getByRole("link", { name: "エージェントのログイン", exact: true });
  assert.equal(await staff.getAttribute("href"), "/agent/login");
  assert.equal(await page.locator("input").count(), 0);
  await shot("landing");
  await staff.click();
  await page.waitForURL("**/agent/login");
  await page.getByLabel("メールアドレス").waitFor();

  // 古いコードが残っていても旧アプリに入らず、コードを読み込んだり書き換えたりしない。
  const storedCode = JSON.stringify("previous-code");
  await page.evaluate(value => localStorage.setItem("poc-access-code", value), storedCode);
  for (const route of ["/", "/join#old-invite", "/join"]) {
    await page.goto(`${BASE_URL}${route}`);
    await page.getByRole("heading", { name: route === "/" ? "AI面接練習" : "この招待リンクの受付は終了しました", exact: true }).waitFor();
    assert.equal(await page.locator("input").count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("poc-access-code")), storedCode);
  }
  await shot("closed-invite");
  for (const route of ["/welcome", "/interview", "/history", "/history/old-session", "/companies", "/profile", "/settings"]) {
    await page.goto(`${BASE_URL}${route}`);
    await page.waitForURL(`${BASE_URL}/`);
    await page.getByRole("heading", { name: "AI面接練習", exact: true }).waitFor();
  }
  await page.getByRole("link", { name: privacyTitle, exact: true }).click();
  await page.waitForURL("**/privacy");
  await page.getByRole("heading", { name: privacyTitle, exact: true }).waitFor();
  for (const heading of ["保存する情報と使いみち", "音声とAIの利用", "結果を確認できる人", "削除・訂正・お問い合わせ"]) {
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
  }
  await shot("privacy");
  await page.goto(`${BASE_URL}/help#mic`);
  await page.getByRole("heading", { name: "マイクが使えない・声が届かない", exact: true }).waitFor();
  await shot("help");
  assert.deepEqual(apiRequests, [], "公開案内・旧招待・説明ページで面接用APIを呼び出さない");

  // 管理者の検証画面は残っている。実際のコード検証や外部サービスの呼び出しはしない。
  await page.goto(`${BASE_URL}/poc`);
  await page.getByLabel("アクセスコード", { exact: true }).waitFor();
  await shot("poc-retained");

  // 案内のリンクだけを確かめるため、招待の情報と設定を固定の応答にする。
  await page.route("**/api/practice", route => route.fulfill({ json: {
    target: {
      id: "release-link", seekerId: "release-seeker", name: "確認用の求職者",
      settings: { stage: "first", style: "standard", durationMin: 5, interviewerModel: "opus", voiceId: "male_a" },
      context: { companyName: "確認用の応募先", position: "看護師", jobDescription: "", careerSummary: "", reasonForChange: "" },
    },
    sessions: [],
  } }));
  await page.route("**/api/poc/config", route => route.fulfill({ json: {
    aiMode: "mock", azureSpeech: false, googleTts: false, googleStt: false,
    interviewerModels: [{ key: "opus", label: "模擬AI" }], voices: [],
    interviewerVoices: { google: null, azure: "male_a" },
  } }));
  const invite = `${BASE_URL}/i#${"a".repeat(22)}`;
  await page.goto(invite);
  const privacyLink = page.getByRole("link", { name: `${privacyTitle}（別のタブで開きます）`, exact: true });
  await privacyLink.waitFor();
  assert.equal(await privacyLink.getAttribute("href"), "/privacy");
  assert.equal(await privacyLink.getAttribute("target"), "_blank");
  await shot("candidate-intro");
  const popupPromise = page.waitForEvent("popup");
  await privacyLink.click();
  const popup = await popupPromise;
  await popup.getByRole("heading", { name: privacyTitle, exact: true }).waitFor();
  assert.equal(page.url(), invite, "説明を開いても元の招待リンクを保つ");
  await popup.close();
} finally {
  await finish();
}
