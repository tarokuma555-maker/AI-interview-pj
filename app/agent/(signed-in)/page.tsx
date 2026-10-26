import { PageHeader } from "@/components/app/ui";

/** ① 担当の求職者(設計 2026-10-27 4.1)。一覧と追加は段階Bで作る */
export default function AgentHomePage() {
  return (
    <>
      <PageHeader title="担当の求職者" />
      <p className="text-muted">まだ求職者がいません。</p>
    </>
  );
}
