import Link from "next/link";
import { Card, PageHeader, PrimaryLink } from "@/components/app/ui";
import { requireAgentRepo } from "@/lib/agent-data";
/** 担当の求職者一覧(設計 2026-10-27 4.1)。 */
export default async function AgentHomePage() {
  const seekers = await (await requireAgentRepo()).listSeekers();
  return <><PageHeader title="担当の求職者" /><PrimaryLink href="/agent/seekers/new">+ 求職者を追加</PrimaryLink>
    {!seekers.length && <p className="text-muted">まだ求職者がいません。</p>}
    {seekers.map(s => <Link key={s.id} href={`/agent/seekers/${s.id}`} className="min-w-0 break-words"><Card>
      <h2 className="text-xl font-bold">{s.name}</h2><p>{s.occupation}</p><p>応募先 {s.linkCount}件</p>
      <p className="text-muted">{s.latestScore === null ? "まだ練習していません" : `最新 ${s.latestScore}点・${new Date(s.latestAt!).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}`}</p>
    </Card></Link>)}
  </>;
}
