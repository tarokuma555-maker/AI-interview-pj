import type { Phase, SessionSettings, SessionState } from "./types";

/**
 * 面接の時間管理(設計書 3.9)。各ターンでサーバーが判定し、
 * 必要ならAI面接官へのシステムメッセージ(通知)を追記する。
 */

const MIN = 60_000;
/** 設定時間をこれだけ超えたら、AIを呼ばずにサーバーが面接を締めくくる */
export const FORCE_CLOSE_GRACE_MS = 3 * MIN;

export type TimeNotice = { key: "time_warning" | "time_up"; text: string };

export type TimeCheck = {
  notices: TimeNotice[];
  forceClose: boolean;
  remainingMs: number | null;
};

const ACTIVE_PHASES: Phase[] = ["opening", "main"];

export function checkTime(settings: SessionSettings, state: SessionState, now: number): TimeCheck {
  if (state.startedAt === null) return { notices: [], forceClose: false, remainingMs: null };

  const durationMs = settings.durationMin * MIN;
  const elapsed = now - state.startedAt;
  const remainingMs = durationMs - elapsed;
  const notices: TimeNotice[] = [];
  const sent = new Set(state.noticesSent);

  if (elapsed >= durationMs + FORCE_CLOSE_GRACE_MS) {
    return { notices, forceClose: true, remainingMs };
  }

  const warnAt = Math.max(durationMs * 0.2, 2 * MIN);
  if (remainingMs <= 0) {
    if (!sent.has("time_up") && state.phase !== "closing" && state.phase !== "ended") {
      notices.push({
        key: "time_up",
        text: "予定の時間になりました。求職者の今の発言に短く応じたら、逆質問は受けずにクロージングして、最後の発言の末尾に [[END]] を付けてください。",
      });
    }
  } else if (remainingMs <= warnAt && !sent.has("time_warning") && ACTIVE_PHASES.includes(state.phase)) {
    const minutes = Math.max(1, Math.round(remainingMs / MIN));
    notices.push({
      key: "time_warning",
      text: `残り時間は約${minutes}分です。今の話題の深掘りは多くても1回にして、次の発言か、その次の発言で逆質問に移ってください。`,
    });
  }

  return { notices, forceClose: false, remainingMs };
}

export function remainingSeconds(settings: SessionSettings, state: SessionState, now: number): number | null {
  if (state.startedAt === null) return null;
  return Math.round((settings.durationMin * MIN - (now - state.startedAt)) / 1000);
}

/** 割り込まれた面接官の発言について、求職者に実際に聞こえていた範囲をAIに伝える */
export function interruptionNotice(sentences: string[], playedSentences: number): string {
  const heard = sentences.slice(0, Math.max(0, playedSentences)).join("");
  return heard
    ? `求職者は面接官の発言の途中で話し始めました。求職者に聞こえていたのは「${heard}」までです。`
    : "求職者は面接官の発言が始まる前に話し始めました。面接官の直前の発言は求職者に聞こえていません。";
}
