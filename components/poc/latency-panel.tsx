import { summarize, type LatencyRecord } from "@/features/interview/client/latency";

const REASON_LABELS: Record<string, string> = {
  manual: "ボタン",
  complete: "文末が完結",
  neutral: "無音",
  max_wait: "最大待ち時間",
  max_utterance: "発話の上限",
  text: "テキスト",
};

/** 応答時間の計測結果(設計書 3.10)。目標は中央値 2.0秒以内、P95 3.0秒以内(要件 NF-P-01) */
export function LatencyPanel({ records }: { records: LatencyRecord[] }) {
  if (records.length === 0) return null;
  const summary = summarize(records);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-bold">応答時間の計測</h2>
      <p className="text-sm">
        話し終えてから面接官の声が聞こえ始めるまで:中央値 {sec(summary.median)}(目標 2.0秒以内)/ P95 {sec(summary.p95)}(目標 3.0秒以内)/ {summary.count}回
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3">回</th>
              <th className="py-1 pr-3">判定</th>
              <th className="py-1 pr-3">判定まで</th>
              <th className="py-1 pr-3">送信→音声</th>
              <th className="py-1 pr-3">合計</th>
              <th className="py-1 pr-3">AI最初の文字</th>
              <th className="py-1 pr-3">最初の音声(サーバー)</th>
              <th className="py-1 pr-3">キャッシュ読込</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.turn} className="border-t border-border">
                <td className="py-1 pr-3">{r.turn}</td>
                <td className="py-1 pr-3">{REASON_LABELS[r.reason] ?? r.reason}</td>
                <td className="py-1 pr-3">{sec(r.detectMs)}</td>
                <td className="py-1 pr-3">{sec(r.responseMs)}</td>
                <td className="py-1 pr-3 font-semibold">{sec(r.totalMs)}</td>
                <td className="py-1 pr-3">{sec(r.server?.firstTokenMs ?? null)}</td>
                <td className="py-1 pr-3">{sec(r.server?.firstAudioMs ?? null)}</td>
                <td className="py-1 pr-3">{r.usage ? `${r.usage.cacheReadTokens} / ${r.usage.cacheReadTokens + r.usage.cacheWriteTokens + r.usage.inputTokens}` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function sec(ms: number | null): string {
  return ms === null ? "-" : `${(ms / 1000).toFixed(2)}秒`;
}
