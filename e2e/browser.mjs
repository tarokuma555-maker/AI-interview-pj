// 画面の確認に使うブラウザ(スマホの縦画面に合わせる)。マイクの音には fixtures/answer.wav(話してから黙る音声)を使う。
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

export const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";
export const ACCESS_CODE = process.env.ACCESS_CODE ?? "test-code";
const OUT = new URL("./out/", import.meta.url).pathname;
const FAKE_AUDIO = new URL("./fixtures/answer.wav", import.meta.url).pathname;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** micAllowed: false ならマイクの使用を断った状態にする */
export async function openPhone(name, { micAllowed = true } = {}) {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    // 決まった場所の Chromium を使う場合は CHROMIUM_PATH を指定する(未指定なら Playwright が入れたもの)
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${FAKE_AUDIO}`,
      "--autoplay-policy=no-user-gesture-required",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE });
  if (!micAllowed) {
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const t0 = Date.now();
  const log = (s) => console.log(`[${name} ${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
  let n = 0;
  /** 画面を保存し、横にはみ出していないかを確かめる */
  async function shot(step) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${OUT}${name}-${String(++n).padStart(2, "0")}-${step}.png`, fullPage: true });
    if (overflow > 0) throw new Error(`${step}: 横に ${overflow}px はみ出しています`);
    log(step);
  }
  async function finish() {
    await browser.close();
    if (errors.length) throw new Error(`ページのエラー: ${errors.join(" / ")}`);
    log("OK");
  }
  return { page, log, shot, finish };
}

/** はじめての案内を済ませて、面接の準備の画面まで進む */
export async function onboard(page, occupation) {
  await page.goto(`${BASE_URL}/join#${ACCESS_CODE}`);
  await page.waitForURL("**/welcome");
  await page.click("text=上の内容に同意します");
  await page.click("text=同意して進む");
  await page.click(`text=${occupation}`);
  await page.click("text=次へ");
  await page.click("text=はじめての面接へ(約5分)");
  await page.waitForSelector("text=このまま始める");
}

/** 段階Bの確認用。開発用コードだけを使い、本物のメールは送らない。 */
export async function agentLogin(page, email) {
  await page.goto(`${BASE_URL}/agent/login`);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByRole("button", { name: "ログインのメールを送る" }).click();
  const notice = await page.waitForSelector("text=/開発用の確認コード/");
  const code = (await notice.textContent()).match(/\d{6}/)[0];
  await page.locator("input[autocomplete=one-time-code]").fill(code);
  await page.getByRole("button", { name: "ログインする", exact: true }).click();
  await page.waitForURL(/\/agent$/);
}
