/** ログインして使うエージェント・管理者(設計 2026-10-27 5章 user_profiles) */
export type Agent = { id: string; email: string; displayName: string; role: "advisor" | "admin" };
