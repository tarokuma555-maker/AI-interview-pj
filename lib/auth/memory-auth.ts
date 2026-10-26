import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Agent } from "./types";

/**
 * Supabase がない環境(手元・e2e)で使う、開発用のログイン(設計 2026-10-27 8章)。
 * 確認コードはメールで送らず、画面に出す。データはサーバーのメモリにだけ置く。
 */

export const MEMORY_SESSION_COOKIE = "agent-dev-session";
const CODE_TTL_MS = 10 * 60 * 1000;

type Store = {
  codes: Map<string, { code: string; expiresAt: number }>;
  sessions: Map<string, string>;
  agentIds: Map<string, string>;
};

// 開発サーバーではルートごとにモジュールが読み込み直されることがあるため、1つの入れ物を共有する
const holder = globalThis as typeof globalThis & { __aiMensetsuMemoryAuth?: Store };
const store: Store = (holder.__aiMensetsuMemoryAuth ??= { codes: new Map(), sessions: new Map(), agentIds: new Map() });

export const memoryAuth = {
  issueCode(email: string): string {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    store.codes.set(email, { code, expiresAt: Date.now() + CODE_TTL_MS });
    return code;
  },

  verifyCode(email: string, code: string): string | null {
    const issued = store.codes.get(email);
    if (!issued || issued.code !== code || Date.now() > issued.expiresAt) return null;
    store.codes.delete(email);
    const sessionId = randomBytes(32).toString("base64url");
    store.sessions.set(sessionId, email);
    if (!store.agentIds.has(email)) store.agentIds.set(email, randomUUID());
    return sessionId;
  },

  agentForSession(sessionId: string): Agent | null {
    const email = store.sessions.get(sessionId);
    if (!email) return null;
    return { id: store.agentIds.get(email)!, email, displayName: email.split("@")[0], role: "advisor" };
  },

  endSession(sessionId: string): void {
    store.sessions.delete(sessionId);
  },
};
