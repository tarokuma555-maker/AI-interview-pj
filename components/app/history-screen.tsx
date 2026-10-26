"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAppConfig } from "@/features/app/access";
import { buildFeedbackRequest, STAGE_CHOICES } from "@/features/app/interview-setup";
import { deleteSession, updateSession, useAppData, useSessions, type SavedSession } from "@/features/app/store";
import { ApiError, fetchFeedback } from "@/features/interview/client/poc-api";
import { formatDate } from "./home-screen";
import { ResultView, Transcript } from "./result-view";
import { Card, Loading, Notice, PageHeader, PrimaryButton, PrimaryLink, SecondaryButton, SecondaryLink } from "./ui";

function target(session: SavedSession): string {
  return session.companyName || session.position || "応募先の指定なし";
}

function stageLabel(session: SavedSession): string {
  return STAGE_CHOICES.find((s) => s.value === session.choice.stage)?.label ?? "";
}

/** 練習の記録(要件 S-10、F-08-1) */
export function HistoryScreen() {
  const sessions = useSessions();
  if (!sessions) return <Loading />;

  return (
    <>
      <PageHeader title="練習の記録" lead="このブラウザに、新しい順に30回分まで残ります。" />
      {sessions.length === 0 ? (
        <>
          <p className="text-muted">まだ練習の記録がありません。</p>
          <PrimaryLink href="/interview">面接を練習する</PrimaryLink>
        </>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link href={`/history/${session.id}`} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-background">
                <span className="flex flex-col">
                  <span className="text-sm text-muted">
                    {formatDate(session.finishedAt)}・{stageLabel(session)}
                  </span>
                  <span className="font-bold">{target(session)}</span>
                </span>
                <span className="shrink-0 text-right">
                  {session.feedback ? (
                    <>
                      <span className="text-2xl font-bold tabular-nums">{session.feedback.feedback.overall_score}</span>
                      <span className="text-sm text-muted">点</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted">評価なし</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SecondaryLink href="/">ホームに戻る</SecondaryLink>
    </>
  );
}

/** 練習の記録の詳細(要件 F-08-2、F-08-3) */
export function HistoryDetailScreen() {
  const sessions = useSessions();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  if (!sessions) return <Loading />;

  const index = sessions.findIndex((s) => s.id === params.id);
  const session = sessions[index];
  if (!session) {
    return (
      <>
        <Notice>この練習の記録は見つかりませんでした。削除されたか、別の端末で練習した記録です。</Notice>
        <SecondaryLink href="/history">練習の記録に戻る</SecondaryLink>
      </>
    );
  }
  const previousScore = sessions.slice(index + 1).find((s) => s.feedback)?.feedback?.feedback.overall_score ?? null;

  return (
    <>
      <PageHeader title={target(session)} lead={`${formatDate(session.finishedAt)}・${stageLabel(session)}`} />
      {session.feedback ? (
        <ResultView result={session.feedback} history={session.history} previousScore={previousScore} actions={<PrimaryLink href="/interview">もう一度練習する</PrimaryLink>} />
      ) : (
        <>
          <RetryFeedback session={session} />
          <Transcript history={session.history} open />
        </>
      )}
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" role="alertdialog" aria-label="記録を削除しますか">
          <p className="font-bold">この練習の記録を削除しますか?元に戻せません。</p>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={() => setConfirming(false)}>やめる</SecondaryButton>
            <SecondaryButton
              onClick={() => {
                deleteSession(session.id);
                router.replace("/history");
              }}
              className="border-danger text-danger"
            >
              削除する
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <SecondaryButton onClick={() => setConfirming(true)}>この記録を削除</SecondaryButton>
      )}
      <SecondaryLink href="/history">練習の記録に戻る</SecondaryLink>
    </>
  );
}

type RetryState = { status: "idle" } | { status: "loading" } | { status: "failed"; message: string } | { status: "no_answers" };

/** 評価がない記録の結果を、会話の記録からまとめ直す(面接直後に評価の作成に失敗した場合など) */
function RetryFeedback({ session }: { session: SavedSession }) {
  const data = useAppData();
  const { state: config, retry: reloadConfig } = useAppConfig(data?.accessCode ?? null);
  const [retry, setRetry] = useState<RetryState>({ status: "idle" });
  const answered = session.history.some((turn) => turn.speaker === "candidate");

  if (!answered || retry.status === "no_answers") return <Notice>回答がなかったため、結果はありません。</Notice>;

  async function run() {
    if (!data?.accessCode || config.status !== "ready") return;
    setRetry({ status: "loading" });
    try {
      const result = await fetchFeedback(data.accessCode, buildFeedbackRequest(data, session, config.config));
      updateSession(session.id, (s) => ({ ...s, feedback: result }));
    } catch (error) {
      if (error instanceof ApiError && error.code === "NO_ANSWERS") setRetry({ status: "no_answers" });
      else setRetry({ status: "failed", message: "結果をまとめられませんでした。時間をおいて、もう一度お試しください。" });
    }
  }

  if (retry.status === "loading") {
    return (
      <Card>
        <p className="flex items-center gap-3 text-lg font-semibold" role="status" aria-live="polite">
          <span className="size-5 animate-spin rounded-full border-4 border-border border-t-accent" aria-hidden />
          結果をまとめています
        </p>
        <p className="text-muted">1分ほどかかります。この画面のままお待ちください。</p>
      </Card>
    );
  }

  return (
    <>
      {retry.status === "failed" ? (
        <Notice tone="danger">{retry.message}</Notice>
      ) : (
        <Notice>この練習の結果は、まだまとまっていません。会話の記録から、いまからまとめられます。</Notice>
      )}
      {config.status === "invalid" ? (
        <Notice>招待の期限が切れているため、結果をまとめられません。担当のキャリアアドバイザーにお問い合わせください。</Notice>
      ) : config.status === "error" ? (
        <>
          <Notice tone="danger">{config.message}</Notice>
          <PrimaryButton onClick={reloadConfig}>もう一度試す</PrimaryButton>
        </>
      ) : (
        <PrimaryButton onClick={() => void run()} disabled={config.status !== "ready"}>
          結果をまとめる
        </PrimaryButton>
      )}
    </>
  );
}
