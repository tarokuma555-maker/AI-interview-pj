import type { ServerLatency, UsageSummary } from "@/lib/interview/types";

/** 1往復ぶんの応答時間の記録(設計書 3.10) */
export type LatencyRecord = {
  turn: number;
  /** 話し終わりと判定した理由(manual / complete / neutral / max_wait など) */
  reason: string;
  /** t0→t1:最後の声から、回答を送るまで(話し終わりの判定にかかった時間) */
  detectMs: number | null;
  /** t1→t4:回答を送ってから、面接官の声が聞こえ始めるまで */
  responseMs: number | null;
  /** t0→t4:話し終えてから、面接官の声が聞こえ始めるまで(要件 NF-P-01 の対象) */
  totalMs: number | null;
  server: ServerLatency | null;
  usage: UsageSummary | null;
};

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}

export function summarize(records: LatencyRecord[]) {
  const totals = records.map((r) => r.totalMs).filter((v): v is number => v !== null);
  return { count: totals.length, median: percentile(totals, 50), p95: percentile(totals, 95) };
}
