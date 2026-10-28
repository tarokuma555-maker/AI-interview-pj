/** エージェントの画面の入口の決まり(設計 2026-10-27 7章) */

export const AGENT_HOME = "/agent";
export const AGENT_LOGIN = "/agent/login";

/**
 * 移す先(移さないなら null)。本当のログインの確認は、各画面のサーバー側でも行う。
 * ログインの画面は入口では移さない(ログイン済みかは画面のサーバー側で確かめる)。入口の目安と画面の判断が
 * 食い違う場合(利用を止めた人、古いログイン情報)に、2つの画面の間で移動が止まらなくなるのを防ぐため。
 */
export function agentRedirect(pathname: string, signedIn: boolean): string | null {
  if (pathname === AGENT_LOGIN) return null;
  const isAgentPage = pathname === AGENT_HOME || pathname.startsWith(`${AGENT_HOME}/`);
  return isAgentPage && !signedIn ? AGENT_LOGIN : null;
}

/** メールのリンクを開いたあとに移す先 */
export function confirmResult(ok: boolean): string {
  return ok ? AGENT_HOME : `${AGENT_LOGIN}?error=link`;
}

export const LOGIN_NOTICES: Record<"link", string> = {
  link: "リンクの期限が切れています。もう一度メールを送ってください",
};

type OtpType = "email" | "invite" | "magiclink";
const OTP_TYPES = new Set<string>(["email", "invite", "magiclink"]);

/**
 * メールのリンクの中身。Supabase の標準のメールは `code`(PKCE。ログインを始めたブラウザで開く)、
 * 文面を変えたメールは `token_hash` と `type` を付けて戻ってくる(設計 2026-10-27 7章)
 */
export function confirmParams(params: URLSearchParams): { kind: "code"; code: string } | { kind: "otp"; tokenHash: string; type: OtpType } | null {
  const code = params.get("code");
  if (code) return { kind: "code", code };
  const tokenHash = params.get("token_hash"), type = params.get("type");
  return tokenHash && type && OTP_TYPES.has(type) ? { kind: "otp", tokenHash, type: type as OtpType } : null;
}

/**
 * エージェントの画面の上部の「戻る」の行き先(2026-10-28 依頼者の要望)。ブラウザの履歴ではなく画面の親に戻す
 * (メールやブックマークから直接開いても迷わないように)。一覧とログインの画面には出さない(null)
 */
export function agentBackHref(pathname: string): string | null {
  if (pathname === AGENT_HOME || pathname === AGENT_LOGIN) return null;
  const parts = pathname.split("/").filter(Boolean); // agent, seekers, :id, links, :lid, practices, :sid
  if (parts[1] !== "seekers" || !parts[2] || parts[2] === "new") return AGENT_HOME;
  const seeker = `${AGENT_HOME}/seekers/${parts[2]}`;
  if (parts.length === 3) return AGENT_HOME;
  if (parts[3] === "links" && parts[4] && parts[4] !== "new" && parts[5] === "practices") return `${seeker}/links/${parts[4]}`;
  return seeker;
}
