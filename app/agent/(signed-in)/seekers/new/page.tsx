import { PageHeader } from "@/components/app/ui";
import { SeekerForm } from "@/components/agent/seeker-form";
import { requireAgentRepo } from "@/lib/agent-data";
export default async function NewSeekerPage() {
  await requireAgentRepo();
  return <><PageHeader title="求職者を追加" /><SeekerForm /></>;
}
