// エージェント(または管理者)を追加・変更する(設計 2026-10-27 7章)。
// 一般の新規登録は止めているため、エージェントはこのスクリプトか Supabase の画面で追加する。
// 追加した人は、/agent/login でメールアドレスを入れるとログインのメールが届く。
//
// 使い方: node scripts/add-agent.mjs <メールアドレス> [--name 表示名] [--admin] [--stop | --resume]
//   --admin  管理者にする(すべての求職者を見られる)
//   --stop   利用を止める / --resume 利用を再開する
// 必要な環境変数: NEXT_PUBLIC_SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY(値は表示しない)
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--name")?.trim().toLowerCase();
const name = args.includes("--name") ? args[args.indexOf("--name") + 1] : undefined;
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("使い方: node scripts/add-agent.mjs <メールアドレス> [--name 表示名] [--admin] [--stop | --resume]");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定してください");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user || data.users.length < 200) return user ?? null;
  }
}

let user = await findUser();
if (!user) {
  // メールの確認は済んだ扱いにする(招待のメールは送らない。ログインのメールで入ってもらう)
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: name ? { display_name: name } : {} });
  if (error) throw error;
  user = data.user;
  console.log(`追加しました: ${email}`);
} else {
  console.log(`すでに登録されています: ${email}`);
}
const patch = {};
if (args.includes("--admin")) patch.role = "admin";
if (name) patch.display_name = name;
if (args.includes("--stop")) patch.is_active = false;
if (args.includes("--resume")) patch.is_active = true;
if (Object.keys(patch).length) {
  const { error } = await supabase.from("user_profiles").update(patch).eq("id", user.id);
  if (error) throw error;
}
const { data: profile, error } = await supabase.from("user_profiles").select("role, display_name, is_active").eq("id", user.id).single();
if (error) throw error;
console.log(`権限: ${profile.role === "admin" ? "管理者" : "エージェント"} / 表示名: ${profile.display_name} / ${profile.is_active ? "利用中" : "停止中"}`);
