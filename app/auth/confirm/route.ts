import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { confirmResult } from "@/lib/auth/routes";
import { backendMode } from "@/lib/backend/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES = new Set<EmailOtpType>(["email", "invite", "magiclink"]);

/** メールのリンク(ログイン・招待)を開いたときの受け口(設計 2026-10-27 7章) */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  let ok = false;
  if (backendMode() === "supabase" && tokenHash && type && TYPES.has(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }
  return NextResponse.redirect(new URL(confirmResult(ok), request.url));
}
