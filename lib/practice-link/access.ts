import { checkPocAccess, checkRateLimit, jsonError } from "@/lib/poc/access";
import { hashLinkKey } from "./key";
import { practiceRepo } from "./repo";
import { PracticeError, type PracticeRepo, type PracticeSession, type PracticeTarget } from "./types";
export const INVALID_LINK_MESSAGE = "この招待リンクは使えません。担当のエージェントにお問い合わせください。";
export function practiceFailure(error: unknown): Response {
  const code = error instanceof PracticeError ? error.code : "UNAVAILABLE";
  if (code === "DAY_LIMIT") return jsonError(429, code, "今日の練習は上限に達しました。明日また練習できます。");
  if (code === "MONTH_LIMIT") return jsonError(429, code, "今月の練習は上限に達しました。来月また練習できます。");
  if (code === "INVALID_LINK") return jsonError(401, code, INVALID_LINK_MESSAGE);
  return jsonError(503, "UNAVAILABLE", "ただいま接続できません。少し待って、もう一度お試しください。", true);
}
export async function requirePractice(request: Request): Promise<{ repo: PracticeRepo; target: PracticeTarget; hash: string }> {
  const key = request.headers.get("x-practice-link") ?? "";
  if (!/^[A-Za-z0-9_-]{22}$/.test(key)) throw new PracticeError("INVALID_LINK");
  const repo = practiceRepo(), hash = hashLinkKey(key), target = await repo.resolve(hash);
  if (!target) throw new PracticeError("INVALID_LINK");
  return { repo, target, hash };
}
type Access = { denied: Response | null; target?: PracticeTarget; session?: PracticeSession };
/** 設計6章。旧招待コードの確認は維持し、新方式は毎回リンクと練習の所属を確認する。 */
export async function interviewAccess(request: Request): Promise<Access> {
  if (!request.headers.has("x-practice-link")) return { denied: checkPocAccess(request) };
  try {
    const { repo, target } = await requirePractice(request);
    const limited = checkRateLimit(request); if (limited) return { denied: limited };
    const path = new URL(request.url).pathname;
    if (path.endsWith("/feedback") || path.endsWith("/stt-token") || path.endsWith("/voices")) return { denied: jsonError(403,"NOT_AVAILABLE","この操作は使えません") };
    const id = request.headers.get("x-practice-session");
    let session: PracticeSession | undefined;
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new PracticeError("INVALID_LINK");
      session = await repo.get(target.id,id) ?? undefined;
      if (!session || session.finishedAt || Date.now() - Date.parse(session.startedAt) > (session.settings.durationMin + 15) * 60000) throw new PracticeError("INVALID_LINK");
    }
    if (path.endsWith("/turns") && !session) return { denied: jsonError(403,"START_REQUIRED","面接を始めるボタンから進んでください") };
    return { denied: null, target, session };
  } catch (e) { return { denied: practiceFailure(e) }; }
}
