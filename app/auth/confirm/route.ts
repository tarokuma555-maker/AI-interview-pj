import { NextResponse, type NextRequest } from "next/server";
import { confirmParams, confirmResult } from "@/lib/auth/routes";
import { backendMode } from "@/lib/backend/mode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** メールのリンク(ログイン・招待)を開いたときの受け口(設計 2026-10-27 7章) */
export async function GET(request: NextRequest) {
  const params = confirmParams(request.nextUrl.searchParams);
  let ok = false;
  if (backendMode() === "supabase" && params) {
    const supabase = await createSupabaseServerClient();
    const { error } = params.kind === "code"
      ? await supabase.auth.exchangeCodeForSession(params.code)
      : await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type });
    ok = !error;
  }
  return NextResponse.redirect(new URL(confirmResult(ok), request.url));
}
