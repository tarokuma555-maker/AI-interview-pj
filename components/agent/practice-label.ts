import type { PracticeSummary } from "@/lib/agent-data/types";

/** 練習の状態を、エージェントの画面の言葉にする(設計 2026-10-27 4.1 ④) */
export function practiceLabel(p: Pick<PracticeSummary, "status" | "score">): string {
  if (p.status === "done") return `${p.score}点`;
  if (p.status === "preparing") return "結果をまとめています";
  if (p.status === "failed") return "結果をまとめられませんでした";
  if (p.status === "no_answers") return "回答なし";
  return "途中で終わった練習";
}

export function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
