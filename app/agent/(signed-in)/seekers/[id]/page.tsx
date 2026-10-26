import { Card, Notice, PageHeader, PrimaryLink, SecondaryLink } from "@/components/app/ui";
import { CopyLinkButton } from "@/components/agent/copy-link-button";
import { DeleteSeeker } from "@/components/agent/delete-seeker";
import { LinkCardActions } from "@/components/agent/link-card-actions";
import { MissingSeeker } from "@/components/agent/missing-seeker";
import { DURATION_CHOICES, STAGE_CHOICES, STYLE_CHOICES } from "@/features/app/interview-setup";
import { requireAgentRepo } from "@/lib/agent-data";
import { requestOrigin } from "@/lib/agent-data/origin";
import { linkUrl } from "@/lib/practice-link/key";
/** 求職者の詳細と応募先ごとの招待リンク(設計 2026-10-27 4.1)。 */
export default async function SeekerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params; const repo = await requireAgentRepo(); const seeker = await repo.getSeeker(id);
  if (!seeker) return <MissingSeeker />;
  const links = await repo.listLinks(id), origin = await requestOrigin(); const { created } = await searchParams;
  const justCreated = links.find(l => l.id === created && !l.disabled);
  return <div className="flex min-w-0 flex-col gap-5 break-words">
    <PageHeader title={seeker.name} />
    {justCreated && <Notice tone="success"><div className="flex min-w-0 flex-col gap-3">
      <p>招待リンクを作りました。LINE やメールで求職者に送ってください。</p>
      <p className="select-all break-all" data-testid="created-link-url">{linkUrl(origin, justCreated.key)}</p>
      <CopyLinkButton url={linkUrl(origin, justCreated.key)} />
    </div></Notice>}
    <Card><h2 className="font-bold">求職者の情報</h2><p>{seeker.occupation || "職種は未入力"}</p>
      {seeker.careerSummary && <p className="whitespace-pre-wrap">{seeker.careerSummary.slice(0, 240)}</p>}
      {seeker.reasonForChange && <p className="whitespace-pre-wrap">{seeker.reasonForChange.slice(0, 240)}</p>}
      <SecondaryLink href={`/agent/seekers/${id}/edit`}>求職者の情報を直す</SecondaryLink>
    </Card>
    <h2 className="text-xl font-bold">応募先ごとの招待リンク</h2>
    {!links.length && <p className="text-muted">まだ応募先がありません。</p>}
    {links.map(l => <Card key={l.id}>
      <h3 className="text-lg font-bold">{l.companyName}</h3><p>{l.position}</p>
      <p>{STAGE_CHOICES.find(c => c.value === l.stage)?.label}・{STYLE_CHOICES.find(c => c.value === l.style)?.label}・{DURATION_CHOICES.find(c => c.value === l.durationMin)?.label}</p>
      <p>{l.practiceCount === 0 ? "まだ練習していません" : `練習 ${l.practiceCount}回・${l.latestScore === null ? "結果はまだありません" : `最新 ${l.latestScore}点`}`}</p>
      {l.disabled ? <Notice>停止中</Notice> : <CopyLinkButton url={linkUrl(origin, l.key)} />}
      <LinkCardActions seekerId={id} linkId={l.id} disabled={l.disabled} />
    </Card>)}
    <PrimaryLink href={`/agent/seekers/${id}/links/new`}>+ 応募先を追加してリンクを作る</PrimaryLink>
    <SecondaryLink href="/agent">担当の求職者へ</SecondaryLink><DeleteSeeker id={id} name={seeker.name} />
  </div>;
}
