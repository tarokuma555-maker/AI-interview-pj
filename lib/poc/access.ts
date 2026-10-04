import { timingSafeEqual } from "node:crypto";

/**
 * 試作版(ログイン機能なし)の API を守るためのアクセスコード。
 * 公開URLで誰でも API を呼べると利用料がかかるため、環境変数 POC_ACCESS_CODE と一致する
 * ヘッダー x-poc-code がないリクエストは拒否する。
 */
export function checkPocAccess(request: Request): Response | null {
  const expected = process.env.POC_ACCESS_CODE;
  if (!expected) {
    return jsonError(503, "POC_DISABLED", "試作版のアクセスコード(POC_ACCESS_CODE)が設定されていません");
  }
  const given = request.headers.get("x-poc-code") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return jsonError(401, "INVALID_CODE", "アクセスコードが正しくありません");
  }
  const limited = checkRateLimit(request);
  return limited;
}

export function jsonError(status: number, code: string, message: string, retryable = false): Response {
  return Response.json({ error: { code, message, retryable } }, { status });
}

/**
 * 簡易的なレート制限(1分あたりの回数)。サーバーのインスタンスごとに数えるため目安であり、
 * 本番では Vercel WAF などで制限する(設計書 9)。
 */
const LIMITS: Record<string, number> = {
  "/api/poc/turns": 60,
  "/api/poc/plan": 10,
  "/api/poc/tts": 60,
  "/api/poc/stt-token": 10,
  "/api/poc/config": 30,
};
const hits = new Map<string, number[]>();

function checkRateLimit(request: Request): Response | null {
  const path = new URL(request.url).pathname;
  const limit = LIMITS[path];
  if (!limit) return null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const key = `${path}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= limit) {
    return jsonError(429, "RATE_LIMITED", "短時間に多くのリクエストがありました。少し待ってから再度お試しください", true);
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}

/** リクエスト本文の大きさを確認してから JSON として読む */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) throw new RangeError("payload too large");
  return JSON.parse(text);
}
