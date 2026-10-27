import Link from "next/link";
import { Card, PageHeader, SecondaryLink } from "@/components/app/ui";
import { MissingSeeker } from "@/components/agent/missing-seeker";
import { formatJst, practiceLabel } from "@/components/agent/practice-label";
import { DURATION_CHOICES, STAGE_CHOICES, STYLE_CHOICES } from "@/features/app/interview-setup";
import { requireAgentRepo } from "@/lib/agent-data";

/** ④ 応募先ごとの練習の一覧(設計 2026-10-27 4.1)。途中で終わった練習は結果を開けない */
export default async function PracticesPage({ params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params; const repo = await requireAgentRepo();
  const seeker = await repo.getSeeker(id), link = seeker ? await repo.getLink(id, linkId) : null;
  const practices = link ? await repo.listPractices(id, linkId) : null;
  if (!seeker || !link || !practices) return <MissingSeeker />;
  return <div className="flex min-w-0 flex-col gap-5 break-words">
    <PageHeader title={`${seeker.name}さん・${link.companyName}`} lead={`${STAGE_CHOICES.find(c => c.value === link.stage)?.label}・${STYLE_CHOICES.find(c => c.value === link.style)?.label}・${DURATION_CHOICES.find(c => c.value === link.durationMin)?.label}`} />
    <h2 className="text-xl font-bold">練習の記録</h2>
    {!practices.length && <p className="text-muted">まだ練習していません。</p>}
    <ul className="flex flex-col gap-3">
      {practices.map(p => <li key={p.id}>{p.status === "unfinished"
        ? <Card><p className="text-sm text-muted">{formatJst(p.startedAt)}</p><p className="font-bold">途中で終わった練習</p></Card>
        : <Link href={`/agent/seekers/${id}/links/${linkId}/practices/${p.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-5 py-3 hover:bg-background">
            <span className="text-sm text-muted">{formatJst(p.startedAt)}</span><span className="font-bold">{practiceLabel(p)}</span>
          </Link>}</li>)}
    </ul>
    <SecondaryLink href={`/agent/seekers/${id}`}>{seeker.name}さんの詳細へ</SecondaryLink>
  </div>;
}
