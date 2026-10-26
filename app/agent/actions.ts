"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { sendLoginCode, signOutAgent, verifyLoginCode } from "@/lib/auth/agent";
import { AGENT_HOME, AGENT_LOGIN } from "@/lib/auth/routes";

/** エージェントのログイン(設計 2026-10-27 7章) */

export async function requestCode(email: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return sendLoginCode(email, `${proto}://${host}`);
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
