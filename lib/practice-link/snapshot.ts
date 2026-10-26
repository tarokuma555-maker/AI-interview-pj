import type { PracticeLink, Seeker } from "@/lib/agent-data/types";
import type { PracticeTarget } from "./types";
/** 設計 2026-10-27 5章。本人の入力ではなく担当者の登録内容を使う。 */
export function targetSnapshot(seeker: Seeker, link: PracticeLink): PracticeTarget {
  return { id: link.id, seekerId: seeker.id, name: seeker.name,
    settings: { stage: link.stage, style: link.style, durationMin: link.durationMin, interviewerModel: "opus", voiceId: "", interviewerName: "佐藤 健一", answerBy: "voice" },
    context: { companyName: link.companyName, position: link.position || seeker.occupation, jobDescription: link.jobDescription, careerSummary: seeker.careerSummary, reasonForChange: seeker.reasonForChange },
  };
}
export function quotaCode(dates: string[], now = new Date()): "DAY_LIMIT" | "MONTH_LIMIT" | null {
  const jst = (date: Date) => new Date(date.getTime() + 9 * 3600_000).toISOString();
  const today = jst(now).slice(0,10), month = today.slice(0,7);
  const local = dates.map(d => jst(new Date(d)));
  if (local.filter(d => d.startsWith(month)).length >= 30) return "MONTH_LIMIT";
  if (local.filter(d => d.startsWith(today)).length >= 3) return "DAY_LIMIT";
  return null;
}
