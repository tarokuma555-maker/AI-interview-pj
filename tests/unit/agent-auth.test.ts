import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeCode, normalizeEmail } from "@/lib/auth/login-input";
import { memoryAuth } from "@/lib/auth/memory-auth";
import { backendMode } from "@/lib/backend/mode";

/** エージェントのログイン(設計 2026-10-27 7章・8章) */

const URL_KEY = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" };

describe("保存先の切り替え", () => {
  it("Supabase の URL とキーが両方あれば Supabase を使う", () => {
    expect(backendMode(URL_KEY)).toBe("supabase");
  });

  it("片方でも欠けていれば、代わりの方式で動く", () => {
    expect(backendMode({ NEXT_PUBLIC_SUPABASE_URL: URL_KEY.NEXT_PUBLIC_SUPABASE_URL })).toBe("memory");
    expect(backendMode({ VERCEL_ENV: "preview" })).toBe("memory");
  });

  it("本番で Supabase の設定がなければ、代わりの方式では動かさない", () => {
    expect(() => backendMode({ VERCEL_ENV: "production" })).toThrow("Supabase の設定がありません");
    expect(backendMode({ ...URL_KEY, VERCEL_ENV: "production" })).toBe("supabase");
  });
});

describe("入力の整え方", () => {
  it("メールアドレスの前後の空白と大文字は、同じ人として扱う", () => {
    expect(normalizeEmail(" Taro@Example.COM ")).toBe("taro@example.com");
  });

  it("確認コードは全角数字・空白・ハイフン入りでも、半角6桁として受け付ける", () => {
    expect(normalizeCode("１２３ ４５６")).toBe("123456");
    expect(normalizeCode("12-34-56")).toBe("123456");
  });

  it("6桁の数字でなければ受け付けない", () => {
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("abcdef")).toBeNull();
    expect(normalizeCode("1234567")).toBeNull();
  });
});

describe("開発用のログイン(Supabase がない環境)", () => {
  afterEach(() => vi.useRealTimers());

  it("正しい確認コードでログインでき、同じコードは2度使えない", () => {
    const code = memoryAuth.issueCode("a@example.com");
    expect(code).toMatch(/^\d{6}$/);
    const session = memoryAuth.verifyCode("a@example.com", code);
    expect(session).toEqual(expect.any(String));
    expect(memoryAuth.verifyCode("a@example.com", code)).toBeNull();
  });

  it("違うコード、ほかの人のコードではログインできない", () => {
    const code = memoryAuth.issueCode("b@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    expect(memoryAuth.verifyCode("b@example.com", wrong)).toBeNull();
    expect(memoryAuth.verifyCode("c@example.com", code)).toBeNull();
  });

  it("コードを作り直したら、前のコードは使えない", () => {
    const first = memoryAuth.issueCode("d@example.com");
    const second = memoryAuth.issueCode("d@example.com");
    if (first !== second) expect(memoryAuth.verifyCode("d@example.com", first)).toBeNull();
    expect(memoryAuth.verifyCode("d@example.com", second)).toEqual(expect.any(String));
  });

  it("コードは10分で使えなくなる", () => {
    vi.useFakeTimers();
    const code = memoryAuth.issueCode("e@example.com");
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(memoryAuth.verifyCode("e@example.com", code)).toBeNull();
  });

  it("同じメールアドレスなら同じエージェント。ログアウトしたら使えない", () => {
    const one = memoryAuth.verifyCode("f@example.com", memoryAuth.issueCode("f@example.com"))!;
    const two = memoryAuth.verifyCode("f@example.com", memoryAuth.issueCode("f@example.com"))!;
    const agent = memoryAuth.agentForSession(one);
    expect(agent).toMatchObject({ email: "f@example.com", displayName: "f", role: "advisor" });
    expect(memoryAuth.agentForSession(two)?.id).toBe(agent?.id);
    memoryAuth.endSession(one);
    expect(memoryAuth.agentForSession(one)).toBeNull();
    expect(memoryAuth.agentForSession("unknown")).toBeNull();
  });
});
