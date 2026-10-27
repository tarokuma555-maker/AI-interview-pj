import type { AgentRepo } from "./types";

export type AccessLogInput = {
  agentId: string;
  seekerId: string;
  sessionId: string | null;
  action: "seeker_view" | "practice_list" | "practice_view";
};
export type AccessLog = AccessLogInput & { createdAt: string };

/** 要件8.3。返すデータの対象だけを記録し、保存失敗時はデータを返さない。
 * 内部の権限確認は raw repo を使うため、1回の読み取りを重複記録しない。
 * ブラウザの先読み・再読み込みを含むサーバーからの提供記録であり、読了の証明ではない。
 */
export function withAccessLog(repo: AgentRepo, agentId: string, write: (entries: AccessLogInput[]) => Promise<void>): AgentRepo {
  const record = async (seekerIds: string[], action: AccessLogInput["action"], sessionId: string | null = null) => {
    if (seekerIds.length) await write([...new Set(seekerIds)].map(seekerId => ({ agentId, seekerId, sessionId, action })));
  };
  return {
    ...repo,
    async listSeekers() {
      const result = await repo.listSeekers();
      await record(result.map(s => s.id), "seeker_view");
      return result;
    },
    async getSeeker(id) {
      const result = await repo.getSeeker(id);
      if (result) await record([result.id], "seeker_view");
      return result;
    },
    async listLinks(id) {
      const result = await repo.listLinks(id);
      if (result.length) await record([id], "seeker_view");
      return result;
    },
    async getLink(sid, lid) {
      const result = await repo.getLink(sid, lid);
      if (result) await record([sid], "seeker_view");
      return result;
    },
    async listPractices(sid, lid) {
      const result = await repo.listPractices(sid, lid);
      if (result) await record([sid], "practice_list");
      return result;
    },
    async getPractice(sid, lid, id) {
      const result = await repo.getPractice(sid, lid, id);
      if (result) await record([sid], "practice_view", result.id);
      return result;
    },
  };
}
