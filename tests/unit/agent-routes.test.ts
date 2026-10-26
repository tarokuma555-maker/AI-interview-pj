import { describe, expect, it } from "vitest";
import { agentRedirect, confirmResult, LOGIN_NOTICES } from "@/lib/auth/routes";

/** エージェントの画面の入口(設計 2026-10-27 7章) */

describe("ログインしていないときの移動", () => {
  it("エージェントの画面は、ログインしていなければログインの画面へ移す", () => {
    expect(agentRedirect("/agent", false)).toBe("/agent/login");
    expect(agentRedirect("/agent/seekers/1", false)).toBe("/agent/login");
    expect(agentRedirect("/agent/login", false)).toBeNull();
  });

  it("ログインの画面は入口では移さない(利用を止めた人・古いログイン情報で、移動が止まらなくなるのを防ぐ)", () => {
    expect(agentRedirect("/agent/login", true)).toBeNull();
    expect(agentRedirect("/agent", true)).toBeNull();
  });

  it("エージェントの画面以外は移さない", () => {
    expect(agentRedirect("/", false)).toBeNull();
    expect(agentRedirect("/agentx", false)).toBeNull();
    expect(agentRedirect("/auth/confirm", false)).toBeNull();
  });
});

describe("メールのリンクを開いたあと", () => {
  it("ログインできたらエージェントの画面へ、できなければ理由つきでログインの画面へ", () => {
    expect(confirmResult(true)).toBe("/agent");
    expect(confirmResult(false)).toBe("/agent/login?error=link");
  });

  it("期限切れ・使用済みのリンクは、メールの送り直しを案内する", () => {
    expect(LOGIN_NOTICES.link).toBe("リンクの期限が切れています。もう一度メールを送ってください");
  });
});
