import type { FeedbackResult } from "@/features/interview/client/poc-api";
import type { TurnRecord } from "@/lib/interview/types";
import type { LinkInput, SeekerInput } from "./schemas";
export type Seeker = SeekerInput & { id: string; advisorId: string; createdAt: string; updatedAt: string };
export type PracticeLink = LinkInput & { id: string; seekerId: string; disabled: boolean; createdAt: string };
export type SessionRow = { id: string; linkId: string; seekerId: string; startedAt: string; score: number | null };
export type SeekerSummary = { id: string; name: string; occupation: string; linkCount: number; latestScore: number | null; latestAt: string | null };
export type LinkSummary = PracticeLink & { key: string; practiceCount: number; latestScore: number | null };
/** 練習の状態(設計 2026-10-27 4.1 ④)。unfinished は会話を保存していない(途中で終わった)練習 */
export type PracticeStatus = "unfinished" | "preparing" | "done" | "no_answers" | "failed";
export type PracticeSummary = { id: string; startedAt: string; finishedAt: string | null; score: number | null; status: PracticeStatus; retryable: boolean };
export type PracticeDetail = PracticeSummary & { linkId: string; history: TurnRecord[]; result: FeedbackResult | null; previousScore: number | null };
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
  /** 担当でない・求職者とリンクの組み合わせが違う場合は null */
  listPractices(seekerId: string, linkId: string): Promise<PracticeSummary[] | null>;
  getPractice(seekerId: string, linkId: string, sessionId: string): Promise<PracticeDetail | null>;
}
