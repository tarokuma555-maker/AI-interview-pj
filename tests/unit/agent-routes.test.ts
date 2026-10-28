import { describe, expect, it } from "vitest";
import { agentBackHref, agentRedirect, confirmParams, confirmResult, LOGIN_NOTICES } from "@/lib/auth/routes";

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

describe("メールのリンクの受け取り方", () => {
  it("Supabase の標準のメールのリンク(code)と、文面を変えたメールのリンク(token_hash)の両方を受け取る", () => {
    expect(confirmParams(new URLSearchParams("code=abc"))).toEqual({ kind: "code", code: "abc" });
    expect(confirmParams(new URLSearchParams("token_hash=h&type=email"))).toEqual({ kind: "otp", tokenHash: "h", type: "email" });
    expect(confirmParams(new URLSearchParams("token_hash=h&type=invite"))).toEqual({ kind: "otp", tokenHash: "h", type: "invite" });
  });

  it("足りない・知らない種類のリンクは受け取らない", () => {
    expect(confirmParams(new URLSearchParams(""))).toBeNull();
    expect(confirmParams(new URLSearchParams("token_hash=h"))).toBeNull();
    expect(confirmParams(new URLSearchParams("token_hash=h&type=recovery"))).toBeNull();
  });
});

describe("エージェントの画面の「戻る」の行き先(2026-10-28 依頼者の要望)", () => {
  const s = "/agent/seekers/s1", l = `${s}/links/l1`;
  it("担当の求職者の一覧には「戻る」を出さない", () => {
    expect(agentBackHref("/agent")).toBeNull();
    expect(agentBackHref("/agent/login")).toBeNull();
  });
  it("求職者の追加・詳細からは一覧へ", () => {
    expect(agentBackHref("/agent/seekers/new")).toBe("/agent");
    expect(agentBackHref(s)).toBe("/agent");
  });
  it("求職者の編集・応募先の追加と編集・練習の一覧からは求職者の詳細へ", () => {
    expect(agentBackHref(`${s}/edit`)).toBe(s);
    expect(agentBackHref(`${s}/links/new`)).toBe(s);
    expect(agentBackHref(`${l}/edit`)).toBe(s);
    expect(agentBackHref(l)).toBe(s);
  });
  it("練習の結果からは練習の一覧へ", () => {
    expect(agentBackHref(`${l}/practices/p1`)).toBe(l);
  });
  it("知らない画面では一覧へ", () => {
    expect(agentBackHref("/agent/unknown")).toBe("/agent");
  });
});
