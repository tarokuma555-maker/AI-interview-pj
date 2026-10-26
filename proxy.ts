import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { MEMORY_SESSION_COOKIE } from "@/lib/auth/memory-auth";
import { agentRedirect } from "@/lib/auth/routes";
import { backendMode } from "@/lib/backend/mode";

/**
 * エージェントのログイン状態を更新し、ログインしていなければログインの画面へ移す(設計 2026-10-27 7章)。
 * ここでの判断は入口の目安で、データの読み書きの前には各画面・API のサーバー側でも確かめる。
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (backendMode() === "memory") {
    return redirectOrNext(request, agentRedirect(pathname, request.cookies.has(MEMORY_SESSION_COOKIE)), NextResponse.next());
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // ログインの期限を延ばす(Cookie を更新する)ため、必ず呼ぶ
  const { data } = await supabase.auth.getUser();
  return redirectOrNext(request, agentRedirect(pathname, !!data.user), response);
}

function redirectOrNext(request: NextRequest, target: string | null, response: NextResponse): NextResponse {
  if (!target) return response;
  const redirect = NextResponse.redirect(new URL(target, request.url));
  // 更新した Cookie を移した先にも渡す
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: ["/agent/:path*", "/auth/:path*"],
};
