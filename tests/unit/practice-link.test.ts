import { describe, expect, it } from "vitest";
import { firstIssue, linkInputSchema, seekerInputSchema } from "@/lib/agent-data/schemas";
import { hashLinkKey, linkKey, linkSecret, linkUrl } from "@/lib/practice-link/key";

/** 招待リンクの鍵(設計 2026-10-27 5章)と、エージェントの入力の検証 */

const SECRET = "s".repeat(32);
const SUPABASE = { NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk" };

describe("リンクの鍵", () => {
  it("同じリンクなら何度作っても同じ鍵になり、ほかのリンクとは違う", () => {
    const key = linkKey("link-1", SECRET);
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(linkKey("link-1", SECRET)).toBe(key);
    expect(linkKey("link-2", SECRET)).not.toBe(key);
    expect(linkKey("link-1", "t".repeat(32))).not.toBe(key);
  });

  it("データベースには鍵ではなくハッシュを置く", () => {
    const key = linkKey("link-1", SECRET);
    const hash = hashLinkKey(key);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key);
    expect(hashLinkKey(key)).toBe(hash);
  });

  it("鍵は URL の「#」の後ろに置く", () => {
    expect(linkUrl("https://x.example", "k")).toBe("https://x.example/i#k");
  });
});

describe("リンクの秘密の値", () => {
  it("設定があればそれを使い、短すぎればエラーにする", () => {
    expect(linkSecret({ PRACTICE_LINK_SECRET: SECRET })).toBe(SECRET);
    expect(() => linkSecret({ PRACTICE_LINK_SECRET: "short" })).toThrow("PRACTICE_LINK_SECRET が短すぎます");
  });

  it("Supabase を使うときは必須", () => {
    expect(() => linkSecret(SUPABASE)).toThrow("PRACTICE_LINK_SECRET が設定されていません");
  });

  it("開発用の方式では、未設定でもサーバーの中で同じ値を使い続ける", () => {
    const first = linkSecret({});
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(linkSecret({})).toBe(first);
  });
});

describe("求職者の入力", () => {
  const base = { name: " 山田 花子 ", occupation: "看護師", careerSummary: "内科病棟8年", reasonForChange: "" };

  it("前後の空白を除く", () => {
    expect(seekerInputSchema.parse(base).name).toBe("山田 花子");
  });

  it("名前がなければ、名前を入れるよう案内する", () => {
    const result = seekerInputSchema.safeParse({ ...base, name: "  " });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toBe("名前を入れてください");
  });

  it("長すぎる名前は受け付けない", () => {
    expect(seekerInputSchema.safeParse({ ...base, name: "あ".repeat(101) }).success).toBe(false);
  });
});

describe("応募先の入力", () => {
  const base = { companyName: "〇〇総合病院", position: "看護師", jobDescription: "", stage: "second", style: "standard", durationMin: 15 };

  it("決まった選考段階・時間だけを受け付ける", () => {
    expect(linkInputSchema.safeParse(base).success).toBe(true);
    expect(linkInputSchema.safeParse({ ...base, durationMin: 20 }).success).toBe(false);
    expect(linkInputSchema.safeParse({ ...base, stage: "fourth" }).success).toBe(false);
  });

  it("応募先の名前がなければ、入れるよう案内する", () => {
    const result = linkInputSchema.safeParse({ ...base, companyName: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toBe("病院・会社の名前を入れてください");
  });
});
