/** エージェントの画面の入口の決まり(設計 2026-10-27 7章) */

export const AGENT_HOME = "/agent";
export const AGENT_LOGIN = "/agent/login";

/** 移す先(移さないなら null)。本当のログインの確認は、各画面のサーバー側でも行う */
export function agentRedirect(pathname: string, signedIn: boolean): string | null {
  if (pathname === AGENT_LOGIN) return signedIn ? AGENT_HOME : null;
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
