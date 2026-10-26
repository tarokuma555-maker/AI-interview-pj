import { ApiError, headers, toApiError, type FeedbackResult } from "@/features/interview/client/poc-api";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import type { TurnRecord } from "@/lib/interview/types";
import type { PracticeSession, PracticeTarget } from "@/lib/practice-link/types";
export async function practiceRequest<T>(code: string, body?: unknown): Promise<T> {
  const response = await fetch("/api/practice", { method: body ? "POST" : "GET", headers: headers(code), cache: "no-store", ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw await toApiError(response);
  return response.json() as Promise<T>;
}
export const loadPractice = (key: string) => practiceRequest<{ target: PracticeTarget; sessions: PracticeSession[] }>(`practice:${key}`);
export async function finishPractice(code: string, history: TurnRecord[], plan: QuestionPlan | null): Promise<FeedbackResult> {
  const sessionId = code.split(":")[2];
  const result = await practiceRequest<{ session: PracticeSession }>(code, { action: "finish", sessionId, history: history.map(t => ({ ...t, llmContent: undefined, sentences: undefined })), plan });
  let session = result.session;
  const deadline = Date.now() + 310000;
  while (session.evaluation === "pending" && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    session = (await practiceRequest<{ session: PracticeSession }>(code)).session;
  }
  if (session.evaluation === "done" && session.result) return session.result;
  if (session.evaluation === "done") throw new ApiError("回答がないため、結果はありません", false,"NO_ANSWERS");
  throw new ApiError("結果をまとめられませんでした。会話の記録は保存されています。",true,"FEEDBACK_FAILED");
}
