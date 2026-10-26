import { describe, expect, it } from "vitest";
import { agentRedirect, confirmResult, LOGIN_NOTICES } from "@/lib/auth/routes";

/** エージェントの画面の入口(設計 2026-10-27 7章) */

describe("ログインしていないときの移動", () => {
  it("エージェントの画面は、ログインしていなければログインの画面へ移す", () => {
    expect(agentRedirect("/agent", false)).toBe("/agent/login");
    expect(agentRedirect("/agent/seekers/1", false)).toBe("/agent/login");
    expect(agentRedirect("/agent/login", false)).toBeNull();
  });

  it("ログイン済みでログインの画面を開いたら、エージェントの画面へ移す", () => {
    expect(agentRedirect("/agent/login", true)).toBe("/agent");
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
