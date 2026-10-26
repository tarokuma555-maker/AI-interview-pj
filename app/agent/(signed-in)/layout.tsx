import { redirect } from "next/navigation";
import { logout } from "@/app/agent/actions";
import { getAgent } from "@/lib/auth/agent";
import { AGENT_LOGIN } from "@/lib/auth/routes";

/** ログインしたエージェントだけが開ける画面(設計 2026-10-27 7章)。利用を止めた人はログインの画面へ戻す */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const agent = await getAgent();
  if (!agent) redirect(AGENT_LOGIN);
  return (
    <>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{agent.displayName} さん</span>
        <form action={logout}>
          <button type="submit" className="min-h-11 px-2 underline-offset-4 hover:underline">
            ログアウト
          </button>
        </form>
      </div>
      {children}
    </>
  );
}
