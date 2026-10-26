// エージェントのログイン(設計 2026-10-27 7章・8章)。Supabase がない環境の、開発用のログインで確かめる
import { BASE_URL, openPhone } from "./browser.mjs";

const { page, shot, finish } = await openPhone("agent-login");

// ログインしていなければ、ログインの画面へ移る
await page.goto(`${BASE_URL}/agent`);
await page.waitForURL("**/agent/login");
await shot("login");

// 古いログイン情報が残っていても、ログインの画面が出る(移動が止まらなくならない)
await page.context().addCookies([{ name: "agent-dev-session", value: "stale", url: BASE_URL }]);
await page.goto(`${BASE_URL}/agent`);
await page.waitForSelector("input[type=email]");
await page.context().clearCookies();

// メールアドレスを入れて送ると、開発用の確認コードが出る。全角で入れてもログインできる
await page.fill("input[type=email]", " Agent@Example.com ");
await page.click("text=ログインのメールを送る");
const notice = await page.waitForSelector("text=/開発用の確認コード/");
const code = (await notice.textContent()).match(/\d{6}/)[0];
await page.fill("input[autocomplete=one-time-code]", code.replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0)));
await shot("code");
await page.click("text=ログインする");
await page.waitForURL(/\/agent$/);
await page.waitForSelector("text=担当の求職者");
await page.waitForSelector("text=agent");
await shot("home");

// 読み込み直してもログインしたまま
await page.reload();
await page.waitForSelector("text=担当の求職者");

// ログアウトしたら、ログインの画面に戻る
await page.click("text=ログアウト");
await page.waitForURL("**/agent/login");
await page.goto(`${BASE_URL}/agent`);
await page.waitForURL("**/agent/login");

// 期限切れのメールのリンクを開いた場合
await page.goto(`${BASE_URL}/auth/confirm?token_hash=expired&type=email`);
await page.waitForURL("**/agent/login?error=link");
await page.waitForSelector("text=リンクの期限が切れています");
await shot("expired");
await finish();
