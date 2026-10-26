"use server";

import { requestOrigin } from "@/lib/agent-data/origin";
import { redirect } from "next/navigation";
import { sendLoginCode, signOutAgent, verifyLoginCode } from "@/lib/auth/agent";
import { AGENT_HOME, AGENT_LOGIN } from "@/lib/auth/routes";

/** エージェントのログイン(設計 2026-10-27 7章) */

export async function requestCode(email: string) {
  return sendLoginCode(email, await requestOrigin());
}

export async function submitCode(email: string, code: string) {
  const result = await verifyLoginCode(email, code);
  if (!result.ok) return result;
  redirect(AGENT_HOME);
}

export async function logout() {
  await signOutAgent();
  redirect(AGENT_LOGIN);
}
