import { PageHeader } from "@/components/app/ui";
import { LinkForm } from "@/components/agent/link-form";
import { MissingSeeker } from "@/components/agent/missing-seeker";
import { requireAgentRepo } from "@/lib/agent-data";
export default async function EditLinkPage({ params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params; const repo = await requireAgentRepo();
  const seeker = await repo.getSeeker(id), link = seeker ? await repo.getLink(id, linkId) : null;
  if (!seeker || !link) return <MissingSeeker />;
  return <><PageHeader title="応募先の情報を直す" lead={`${seeker.name}さん`} /><LinkForm seekerId={id} link={link} /></>;
}
