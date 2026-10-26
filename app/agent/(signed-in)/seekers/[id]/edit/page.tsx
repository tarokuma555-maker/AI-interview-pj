import { PageHeader } from "@/components/app/ui";
import { SeekerForm } from "@/components/agent/seeker-form";
import { MissingSeeker } from "@/components/agent/missing-seeker";
import { requireAgentRepo } from "@/lib/agent-data";
export default async function EditSeekerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const seeker = await (await requireAgentRepo()).getSeeker(id);
  if (!seeker) return <MissingSeeker />;
  return <><PageHeader title="求職者の情報を直す" /><SeekerForm seeker={seeker} /></>;
}
