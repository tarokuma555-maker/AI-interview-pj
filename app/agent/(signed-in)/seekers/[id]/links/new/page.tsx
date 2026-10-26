import { PageHeader } from "@/components/app/ui";
import { LinkForm } from "@/components/agent/link-form";
import { MissingSeeker } from "@/components/agent/missing-seeker";
import { requireAgentRepo } from "@/lib/agent-data";
export default async function NewLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const seeker = await (await requireAgentRepo()).getSeeker(id);
  if (!seeker) return <MissingSeeker />;
  return <><PageHeader title="応募先を追加してリンクを作る" lead={`${seeker.name}さん`} /><LinkForm seekerId={id} /></>;
}
