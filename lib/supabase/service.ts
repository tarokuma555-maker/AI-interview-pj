import { createClient } from "@supabase/supabase-js";
/** サーバー専用。求職者の招待キーを検証する用途のみ。ブラウザや本人ログインの接続と混ぜない。 */
export function createSupabaseServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("保存先の設定がありません");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
