"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAgentRepo } from "@/lib/agent-data";
import { firstIssue, linkInputSchema, seekerInputSchema } from "@/lib/agent-data/schemas";
import { evaluatePractice } from "@/lib/practice-link/evaluate";
import { practiceRepo } from "@/lib/practice-link/repo";
const missing = { ok: false as const, message: "この求職者は見つかりません" };
const failed = { ok: false as const, message: "保存できませんでした。少し待って、もう一度お試しください" };
/** 設計 2026-10-27 6章。各操作で認証→入力確認→担当範囲で保存。 */
export async function saveSeeker(id: string | null, input: unknown) {
  const repo = await requireAgentRepo(); const parsed = seekerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: firstIssue(parsed.error) };
  let resultId = id;
  try { if (id) { if (!await repo.updateSeeker(id, parsed.data)) return missing; } else resultId = await repo.createSeeker(parsed.data); } catch { return failed; }
  revalidatePath("/agent", "layout"); redirect(`/agent/seekers/${resultId}`);
}
export async function removeSeeker(id: string) {
  const repo = await requireAgentRepo();
  try { if (!await repo.deleteSeeker(id)) return missing; } catch { return failed; }
  revalidatePath("/agent", "layout"); redirect("/agent");
}
export async function saveLink(seekerId: string, linkId: string | null, input: unknown) {
  const repo = await requireAgentRepo(); const parsed = linkInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: firstIssue(parsed.error) };
  let resultId = linkId;
  try { if (linkId) { if (!await repo.updateLink(seekerId, linkId, parsed.data)) return missing; } else { resultId = await repo.createLink(seekerId, parsed.data); if (!resultId) return missing; } } catch { return failed; }
  revalidatePath("/agent", "layout"); redirect(`/agent/seekers/${seekerId}${linkId ? "" : `?created=${resultId}`}`);
}
export async function toggleLink(seekerId: string, linkId: string, disabled: boolean) {
  const repo = await requireAgentRepo();
  if (typeof disabled !== "boolean") return failed;
  try { if (!await repo.setLinkDisabled(seekerId, linkId, disabled)) return missing; } catch { return failed; }
  revalidatePath("/agent", "layout"); return { ok: true as const };
}
/** 結果をまとめられなかった・止まった練習の結果を作り直す(段階D)。担当であることを確かめてから、管理用の接続で書く */
export async function retryEvaluation(seekerId: string, linkId: string, sessionId: string) {
  const repo = await requireAgentRepo();
  try {
    if (!await repo.getPractice(seekerId, linkId, sessionId)) return { ok: false as const, message: "この練習は見つかりません" };
    const practice = practiceRepo(), session = await practice.get(linkId, sessionId);
    if (!session || !await practice.reopen(linkId, sessionId)) return { ok: false as const, message: "いまは作り直せません。少し待ってから開き直してください" };
    after(() => evaluatePractice(practice, linkId, session, session.history, session.plan));
  } catch { return failed; }
  revalidatePath("/agent", "layout"); return { ok: true as const };
}
