"use client";

import { AnswerReviews, AxisList, DeliveryTable, NextActions, PointList } from "@/components/poc/feedback-view";
import type { FeedbackResult } from "@/features/interview/client/poc-api";
import type { TurnRecord } from "@/lib/interview/types";
import { Card } from "./ui";

/**
 * 面接の結果(要件 S-09、7.4 の見せ方)。最初に総評・点数・良かった点・改善点・次にやることだけを出し、
 * 観点別評価・話し方・質問ごとの講評・会話の記録は開いて読む形にする。
 */
export function ResultView({
  result,
  history,
  previousScore,
  actions,
}: {
  result: FeedbackResult;
  history: TurnRecord[];
  /** 前回の総合スコア(なければ null) */
  previousScore: number | null;
  /** 「もう一度練習する」などのボタン */
  actions?: React.ReactNode;
}) {
  const { feedback, metrics } = result;
  const diff = previousScore === null ? null : feedback.overall_score - previousScore;

  return (
    <>
      <Card>
        <div className="flex items-end gap-3">
          <p className="flex items-baseline gap-1">
            <span className="text-5xl font-bold tabular-nums">{feedback.overall_score}</span>
            <span className="text-muted">/ 100点</span>
          </p>
          {diff !== null && diff !== 0 && (
            <span className={`mb-1 font-bold ${diff > 0 ? "text-success" : "text-muted"}`}>
              前回より {diff > 0 ? `+${diff}` : diff}点
            </span>
          )}
        </div>
        <p className="leading-relaxed">{feedback.summary}</p>
        <p className="text-xs text-muted">評価は練習のための参考で、合否を予測するものではありません。声の聞き違いは減点していません。</p>
      </Card>

      <Card>
        <PointList title="良かった点" items={feedback.strengths} />
        <PointList title="次に直すとよい点" items={feedback.improvements} ordered />
      </Card>

      <Card>
        <h2 className="font-bold">次にやること</h2>
        <NextActions actions={feedback.next_actions} />
      </Card>

      {actions}

      <div className="flex flex-col gap-3">
        <Details title="観点ごとの評価">
          <AxisList axes={feedback.axes} />
        </Details>
        {metrics.some((m) => m.inputMode !== "text") && (
          <Details title="話し方(長さ・速さ・間)">
            <DeliveryTable metrics={metrics} />
          </Details>
        )}
        <Details title="質問ごとの講評と回答例">
          <AnswerReviews result={result} />
        </Details>
        <Transcript history={history} />
      </div>
    </>
  );
}

export function Details({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface" open={open}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-bold">
        {title}
        <span aria-hidden className="text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">{children}</div>
    </details>
  );
}

/** 会話の記録(面接官と自分の発言) */
export function Transcript({ history, open }: { history: TurnRecord[]; open?: boolean }) {
  const turns = history.filter((t) => t.speaker !== "system");
  if (turns.length === 0) return null;
  return (
    <Details title="会話の記録" open={open}>
      <ol className="flex flex-col gap-3">
        {turns.map((t, i) => (
          <li key={i} className={`rounded-xl p-3 leading-relaxed ${t.speaker === "interviewer" ? "bg-background" : "bg-accent-soft"}`}>
            <span className="block text-sm font-semibold text-muted">{t.speaker === "interviewer" ? "面接官" : "あなた"}</span>
            {t.text}
          </li>
        ))}
      </ol>
    </Details>
  );
}
