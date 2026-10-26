/**
 * データの保存先とログインの方式(設計 2026-10-27 8章)。
 * Supabase の URL とキーがあれば Supabase、なければサーバーのメモリに置く代わりの方式で動く。
 * 代わりの方式はサーバーを立ち上げ直すと消えるため、本番では使わない。
 */
export type BackendMode = "supabase" | "memory";

type Env = Partial<Record<string, string | undefined>>;

export function backendMode(env: Env = process.env): BackendMode {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return "supabase";
  if (env.VERCEL_ENV === "production") throw new Error("Supabase の設定がありません");
  return "memory";
}
