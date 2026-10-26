import { redirect } from "next/navigation";
import { backendMode } from "@/lib/backend/mode";
import { getAgent } from "@/lib/auth/agent";
import type { Agent } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createMemoryRepo } from "./memory-repo";
import { createSupabaseRepo } from "./supabase-repo";
import type { AgentRepo } from "./types";
export async function agentRepo(agent: Agent): Promise<AgentRepo> {
  return backendMode() === "memory" ? createMemoryRepo(agent) : createSupabaseRepo(await createSupabaseServerClient(), agent);
}
/** 各ページ・操作で本人を確かめる(設計 2026-10-27 6章)。layoutだけに依存しない。 */
export async function requireAgentRepo(): Promise<AgentRepo> {
  const agent = await getAgent();
  if (!agent) redirect("/agent/login");
  return agentRepo(agent);
}
