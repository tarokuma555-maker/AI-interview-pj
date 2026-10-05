"use client";

import type { FeedbackState } from "@/features/interview/client/interview-controller";
import { FEEDBACK_AXIS_LABELS } from "@/lib/ai/schemas/feedback";
import { QUESTION_CATEGORY_LABELS } from "@/lib/ai/schemas/plan";
import { DELIVERY_TARGETS, judgeDelay, judgeLength, judgeRate, type AnswerMetrics, type Judgement } from "@/lib/interview/speech-metrics";

/** 面接後の評価・フィードバック(要件 7.4、設計書 7.3) */
export function FeedbackView({ state, onRetry }: { state: FeedbackState; onRetry: () => void }) {
  if (state.status === "none") return null;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5" aria-live="polite">
      <h2 className="text-lg font-bold">面接の評価とフィードバック</h2>
      {state.status === "loading" && <p className="text-sm text-muted">面接の内容を評価しています。1分ほどかかります…</p>}
      {state.status === "no_answers" && <p className="text-sm text-muted">回答がなかったため、評価はありません。</p>}
      {state.status === "failed" && (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p className="text-danger">{state.message}</p>
          <button type="button" onClick={onRetry} className="rounded-lg border border-border px-3 py-2">
            評価を作り直す
          </button>
        </div>
      )}
      {state.status === "done" && <FeedbackBody result={state.result} />}
    </section>
  );
}

function FeedbackBody({ result }: { result: Extract<FeedbackState, { status: "done" }>["result"] }) {
  const { feedback, metrics } = result;
  const metricsBySeq = new Map(metrics.map((m) => [m.turn_seq, m]));

  return (
    <>
      {/* 1. 総合スコアと総評 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center rounded-lg border border-border px-6 py-3">
          <span className="text-sm text-muted">総合スコア</span>
          <span className="text-4xl font-bold tabular-nums">{feedback.overall_score}</span>
          <span className="text-sm text-muted">/ 100点</span>
        </div>
        <div className="flex flex-col gap-2">
          <p className="leading-relaxed">{feedback.summary}</p>
          <p className="text-xs text-muted">
            評価は練習のための参考情報で、合否を示すものではありません。音声認識の聞き違いは減点していません。総合スコアは観点別評価の平均 × 20 です。
          </p>
        </div>
      </div>

      {/* 2. 観点別評価 */}
      <div className="flex flex-col gap-3">
        <h3 className="font-bold">観点別評価(5段階)</h3>
        <ul className="flex flex-col gap-3">
          {feedback.axes.map((axis) => (
            <li key={axis.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0">{FEEDBACK_AXIS_LABELS[axis.key]}</span>
                <span
                  className="h-2 flex-1 overflow-hidden rounded-full bg-background"
                  role="img"
                  aria-label={`${FEEDBACK_AXIS_LABELS[axis.key]} 5段階中${axis.score}`}
                  title={`${axis.score} / 5`}
                >
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(axis.score / 5) * 100}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{axis.score} / 5</span>
              </div>
              {axis.reason && <p className="text-sm text-muted">{axis.reason}</p>}
            </li>
          ))}
        </ul>
      </div>

      {/* 3. 良かった点・改善点 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PointList title="良かった点" items={feedback.strengths} />
        <PointList title="改善点(優先度の高い順)" items={feedback.improvements} ordered />
      </div>

      {/* 4. 話し方の指標 */}
      <DeliveryTable metrics={metrics} />

      {/* 5. 質問ごとの講評 */}
      <div className="flex flex-col gap-3">
        <h3 className="font-bold">質問ごとの講評</h3>
        {feedback.answers.map((answer) => {
          const m = metricsBySeq.get(answer.turn_seq);
          return (
            <article key={answer.turn_seq} className="flex flex-col gap-2 rounded-lg border border-border p-4 text-sm">
              {m?.question && <p className="font-semibold">{m.isReverseQuestion ? "逆質問の場面" : "質問"}:{m.question}</p>}
              <p className="text-muted">
                {m?.isReverseQuestion ? "あなたの逆質問" : "あなたの回答"}:{m?.answer}
              </p>
              <p>
                評価:<span className="font-semibold tabular-nums">{answer.rating} / 5</span>
              </p>
              <PointList title="良かった点" items={answer.good_points} compact />
              <PointList title="改善点" items={answer.improvements} compact />
              <div className="rounded-lg bg-background p-3">
                <p className="mb-1 font-semibold">{m?.isReverseQuestion ? "より良い逆質問の例" : "改善後の回答例"}</p>
                <p className="leading-relaxed">{answer.improved_answer}</p>
                {answer.uses_assumed_content && (
                  <p className="mt-1 text-xs text-muted">「(例)」の部分は、応募書類や回答にない内容を補った例です。ご自身の実際の経験に置き換えてください。</p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* 6. 次回の練習課題 */}
      <div className="flex flex-col gap-2">
        <h3 className="font-bold">次回の練習課題</h3>
        <ol className="flex flex-col gap-2 text-sm">
          {feedback.next_actions.map((action, i) => (
            <li key={i} className="rounded-lg border border-border p-3">
              <p className="font-semibold">
                {i + 1}. {action.title}
                <span className="ml-2 text-xs font-normal text-muted">{QUESTION_CATEGORY_LABELS[action.category]}</span>
              </p>
              <p>{action.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function PointList({ title, items, ordered, compact }: { title: string; items: string[]; ordered?: boolean; compact?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <div className="flex flex-col gap-1">
      <p className={compact ? "font-semibold" : "font-bold"}>{title}</p>
      <List className={`${ordered ? "list-decimal" : "list-disc"} flex flex-col gap-1 pl-5 ${compact ? "" : "text-sm"}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </List>
    </div>
  );
}

const LENGTH_LABELS: Record<Judgement, string> = { short: "短め", ok: "目安どおり", long: "長め" };
const RATE_LABELS: Record<Judgement, string> = { short: "ゆっくり", ok: "目安どおり", long: "速め" };

/** 回答ごとの回答時間・話す速さ・話し始めるまでの時間と、目安との比較(要件 F-07-5) */
function DeliveryTable({ metrics }: { metrics: AnswerMetrics[] }) {
  const voiced = metrics.filter((m) => m.inputMode !== "text");
  if (voiced.length === 0) return null;
  const t = DELIVERY_TARGETS;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-bold">話し方の指標</h3>
      <p className="text-xs text-muted">
        目安:回答の長さ {t.answerSec.min / 60}〜{t.answerSec.max / 60}分(自己紹介は{t.introductionSec.min / 60}〜{t.introductionSec.max / 60}分)、話す速さ 1分あたり
        {t.charsPerMinute.min}〜{t.charsPerMinute.max}字、話し始めるまで{t.responseDelaySec.max}秒以内
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-1 pr-3">回答</th>
              <th className="py-1 pr-3">回答の長さ</th>
              <th className="py-1 pr-3">話す速さ</th>
              <th className="py-1 pr-3">話し始めるまで</th>
            </tr>
          </thead>
          <tbody>
            {voiced.map((m) => (
              <tr key={m.turn_seq} className="border-t border-border">
                <td className="py-1 pr-3">
                  {m.isIntroduction ? "自己紹介" : m.isReverseQuestion ? "逆質問" : `${metrics.filter((x) => !x.isIntroduction && !x.isReverseQuestion && x.turn_seq <= m.turn_seq).length}問目`}
                </td>
                <td className="py-1 pr-3">{cell(m.speechSec, "秒", judgeLength(m), LENGTH_LABELS)}</td>
                <td className="py-1 pr-3">{cell(m.charsPerMinute, "字/分", judgeRate(m), RATE_LABELS)}</td>
                <td className="py-1 pr-3">{cell(m.responseDelaySec, "秒", judgeDelay(m), LENGTH_LABELS)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function cell(value: number | undefined, unit: string, judgement: Judgement | undefined, labels: Record<Judgement, string>) {
  if (value === undefined) return "-";
  return (
    <>
      <span className="tabular-nums">
        {value}
        {unit}
      </span>
      {judgement && <span className={`ml-2 text-xs ${judgement === "ok" ? "text-muted" : "font-semibold"}`}>({labels[judgement]})</span>}
    </>
  );
}
