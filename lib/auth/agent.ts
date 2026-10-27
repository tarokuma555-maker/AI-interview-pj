import { cookies } from "next/headers";
import { backendMode } from "@/lib/backend/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmail, normalizeCode, normalizeEmail } from "./login-input";
import { MEMORY_SESSION_COOKIE, memoryAuth } from "./memory-auth";
import { INPUT_MESSAGES, loginErrorMessage } from "./messages";
import type { Agent } from "./types";

/**
 * エージェントのログインの窓口(設計 2026-10-27 7章・8章)。
 * Supabase があれば Supabase Auth(メールのリンクと6桁の確認コード)、なければ開発用のログインを使う。
 */

type Failure = { ok: false; message: string };

/** ログインしているエージェント。ログインしていない・利用を止めた人は null */
export async function getAgent(): Promise<Agent | null> {
  if (backendMode() === "memory") {
    const sessionId = (await cookies()).get(MEMORY_SESSION_COOKIE)?.value;
    return sessionId ? memoryAuth.agentForSession(sessionId) : null;
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("user_profiles").select("role, display_name, is_active").eq("id", data.user.id).maybeSingle();
  if (!profile || !profile.is_active) return null;
  return { id: data.user.id, email: data.user.email ?? "", displayName: profile.display_name, role: profile.role };
}

/** ログインのメールを送る。開発用のログインでは、確認コードを devCode として返す(画面に出す) */
export async function sendLoginCode(input: string, origin: string): Promise<{ ok: true; devCode?: string } | Failure> {
  const email = normalizeEmail(input);
  if (!isEmail(email)) return { ok: false, message: INPUT_MESSAGES.email };
  if (backendMode() === "memory") return { ok: true, devCode: memoryAuth.issueCode(email) };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // 招待制(要件 F-01-1)。登録されていない人のアカウントは作らない
    // メールのリンクは、ログインを始めた画面の /auth/confirm に戻る(許可リストは supabase/config.toml)
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  });
  return error ? { ok: false, message: loginErrorMessage(error) } : { ok: true };
}

/** メールに書かれた確認コードでログインする */
export async function verifyLoginCode(input: string, codeInput: string): Promise<{ ok: true } | Failure> {
  const email = normalizeEmail(input);
  const code = normalizeCode(codeInput);
  if (!isEmail(email)) return { ok: false, message: INPUT_MESSAGES.email };
  if (!code) return { ok: false, message: INPUT_MESSAGES.code };
  if (backendMode() === "memory") {
    const sessionId = memoryAuth.verifyCode(email, code);
    if (!sessionId) return { ok: false, message: loginErrorMessage({ code: "otp_expired" }) };
    (await cookies()).set(MEMORY_SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    return { ok: true };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  return error ? { ok: false, message: loginErrorMessage(error) } : { ok: true };
}

export async function signOutAgent(): Promise<void> {
  if (backendMode() === "memory") {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(MEMORY_SESSION_COOKIE)?.value;
    if (sessionId) memoryAuth.endSession(sessionId);
    cookieStore.delete(MEMORY_SESSION_COOKIE);
    return;
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
