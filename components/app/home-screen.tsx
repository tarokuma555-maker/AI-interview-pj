"use client";

import Link from "next/link";
import { occupationLabel } from "@/features/app/occupations";
import { useAppData, useSessions, type SavedSession } from "@/features/app/store";
import { Card, PrimaryLink } from "./ui";

/** ホーム(要件 S-02)。主なボタンは「面接を練習する」の1つにする(UX-01) */
export function HomeScreen() {
  const data = useAppData();
  const sessions = useSessions();
  if (!data || !sessions) return null;

  const last = sessions[0];
  const hasDocuments = !!(data.profile.careerSummary.trim() || data.profile.reasonForChange.trim());

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-muted">{occupationLabel(data.profile.occupation, data.profile.occupationOther)}の面接練習</p>
        <h1 className="text-2xl font-bold">今日も練習しましょう</h1>
      </header>

      <PrimaryLink href="/interview">面接を練習する</PrimaryLink>

      {last && <LastResult session={last} />}

      {!hasDocuments && (
        <Card tone="accent">
          <p className="font-bold">経歴を登録すると、あなたに合わせた質問になります</p>
          <p className="text-sm leading-relaxed">これまでのお仕事や転職を考えた理由を、メモ程度に書いておくだけで大丈夫です。</p>
          <Link href="/profile" className="font-semibold text-accent underline underline-offset-4">
            経歴を登録する
          </Link>
        </Card>
      )}

      <nav aria-label="メニュー">
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          <MenuItem href="/history" title="練習の記録" detail={sessions.length ? `${sessions.length}回` : "まだありません"} />
          <MenuItem href="/companies" title="応募先" detail={data.companies.length ? `${data.companies.length}件` : "登録すると応募先に合わせて練習できます"} />
          <MenuItem href="/profile" title="職種・経歴" detail={hasDocuments ? "登録済み" : "未登録"} />
          <MenuItem href="/settings" title="設定" detail="面接官の話す速さ・データの削除など" />
        </ul>
      </nav>
    </>
  );
}

function LastResult({ session }: { session: SavedSession }) {
  const feedback = session.feedback?.feedback;
  const next = feedback?.next_actions[0];
  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">前回の練習</h2>
        <span className="text-sm text-muted">{formatDate(session.finishedAt)}</span>
      </div>
      {feedback ? (
        <>
          <p className="flex items-baseline gap-1">
            <span className="text-4xl font-bold tabular-nums">{feedback.overall_score}</span>
            <span className="text-muted">/ 100点</span>
          </p>
          {next && (
            <div className="rounded-xl bg-background p-3">
              <p className="text-sm text-muted">次にやること</p>
              <p className="font-semibold">{next.title}</p>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted">評価はありません</p>
      )}
      <Link href={`/history/${session.id}`} className="font-semibold text-accent underline underline-offset-4">
        結果をくわしく見る
      </Link>
    </Card>
  );
}

function MenuItem({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-16 items-center justify-between gap-3 px-5 py-3 hover:bg-background">
        <span className="flex flex-col">
          <span className="font-bold">{title}</span>
          <span className="text-sm text-muted">{detail}</span>
        </span>
        <span aria-hidden className="text-xl text-muted">
          ›
        </span>
      </Link>
    </li>
  );
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
