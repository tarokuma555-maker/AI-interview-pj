import { redirect } from "next/navigation";
import { LoginForm } from "@/components/agent/login-form";
import { PageHeader } from "@/components/app/ui";
import { getAgent } from "@/lib/auth/agent";
import { AGENT_HOME, LOGIN_NOTICES } from "@/lib/auth/routes";

export default async function AgentLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await getAgent()) redirect(AGENT_HOME);
  return (
    <>
      <PageHeader title="ログイン" lead="登録されているメールアドレスを入れてください。ログインのメールが届きます。" />
      <LoginForm notice={error === "link" ? LOGIN_NOTICES.link : null} />
    </>
  );
}
