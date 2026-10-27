import { Notice, PageHeader, SecondaryLink } from "@/components/app/ui";
import { ResultView, Transcript } from "@/components/app/result-view";
import { formatJst } from "@/components/agent/practice-label";
import { RetryEvaluation } from "@/components/agent/retry-evaluation";
import { requireAgentRepo } from "@/lib/agent-data";

/** 練習の結果と会話の記録(設計 2026-10-27 4.1 ④)。求職者と同じ結果を出す */
export default async function PracticeResultPage({ params }: { params: Promise<{ id: string; linkId: string; sessionId: string }> }) {
  const { id, linkId, sessionId } = await params; const repo = await requireAgentRepo();
  const seeker = await repo.getSeeker(id), link = seeker ? await repo.getLink(id, linkId) : null;
  const practice = link ? await repo.getPractice(id, linkId, sessionId) : null;
  if (!seeker || !link || !practice) return <><PageHeader title="この練習は見つかりません" /><SecondaryLink href="/agent">担当の求職者へ</SecondaryLink></>;
  const back = <SecondaryLink href={`/agent/seekers/${id}/links/${linkId}`}>練習の記録へ戻る</SecondaryLink>;
  return <div className="flex min-w-0 flex-col gap-5 break-words">
    <PageHeader title={`${seeker.name}さん・${link.companyName}`} lead={formatJst(practice.startedAt)} />
    {practice.status === "done" && practice.result
      ? <ResultView result={practice.result} history={practice.history} previousScore={practice.previousScore} actions={back} />
      : <>
          <Notice>{practice.status === "unfinished" ? "途中で終わった練習のため、会話は保存されていません。"
            : practice.status === "no_answers" ? "回答がなかったため、結果はありません。"
            : practice.status === "failed" ? "結果をまとめられませんでした。会話の記録は保存されています。"
            : "結果をまとめています。少し待ってから開き直してください。"}</Notice>
          {practice.retryable && <RetryEvaluation seekerId={id} linkId={linkId} sessionId={sessionId} />}
          <Transcript history={practice.history} open />
          {back}
        </>}
  </div>;
}
