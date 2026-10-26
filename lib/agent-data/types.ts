import type { LinkInput, SeekerInput } from "./schemas";
export type Seeker = SeekerInput & { id: string; advisorId: string; createdAt: string; updatedAt: string };
export type PracticeLink = LinkInput & { id: string; seekerId: string; disabled: boolean; createdAt: string };
export type SessionRow = { id: string; linkId: string; seekerId: string; startedAt: string; score: number | null };
export type SeekerSummary = { id: string; name: string; occupation: string; linkCount: number; latestScore: number | null; latestAt: string | null };
export type LinkSummary = PracticeLink & { key: string; practiceCount: number; latestScore: number | null };
export interface AgentRepo {
  listSeekers(): Promise<SeekerSummary[]>;
  getSeeker(id: string): Promise<Seeker | null>;
  createSeeker(input: SeekerInput): Promise<string>;
  updateSeeker(id: string, input: SeekerInput): Promise<boolean>;
  deleteSeeker(id: string): Promise<boolean>;
  listLinks(seekerId: string): Promise<LinkSummary[]>;
  getLink(seekerId: string, linkId: string): Promise<PracticeLink | null>;
  createLink(seekerId: string, input: LinkInput): Promise<string | null>;
  updateLink(seekerId: string, linkId: string, input: LinkInput): Promise<boolean>;
  setLinkDisabled(seekerId: string, linkId: string, disabled: boolean): Promise<boolean>;
}
