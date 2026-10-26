import { createHash, createHmac, randomBytes } from "node:crypto";
import { backendMode } from "@/lib/backend/mode";

/** 設計 2026-10-27 5章。DBにはハッシュだけを保存し、担当者には同じ鍵を再生成する。 */
const globals = globalThis as typeof globalThis & { practiceLinkSecret?: string };
export function linkSecret(env: Partial<Record<string, string | undefined>> = process.env): string {
  if (env.PRACTICE_LINK_SECRET) {
    if (env.PRACTICE_LINK_SECRET.length < 32) throw new Error("PRACTICE_LINK_SECRET が短すぎます");
    return env.PRACTICE_LINK_SECRET;
  }
  if (backendMode(env) === "supabase") throw new Error("PRACTICE_LINK_SECRET が設定されていません");
  return globals.practiceLinkSecret ??= randomBytes(32).toString("base64url");
}
export function linkKey(linkId: string, secret: string): string {
  return createHmac("sha256", secret).update(linkId).digest().subarray(0, 16).toString("base64url");
}
export function hashLinkKey(key: string): string { return createHash("sha256").update(key).digest("hex"); }
export function linkUrl(origin: string, key: string): string { return `${origin.replace(/\/$/, "")}/i#${key}`; }
