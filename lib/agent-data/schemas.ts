import { z } from "zod";

/** 設計 2026-10-27 5章。DBと同じ上限で、書き込む前に検証する。 */
const text = (max: number) => z.string().trim().max(max, `${max}文字以内で入れてください`);
export const seekerInputSchema = z.object({
  name: text(100).min(1, "名前を入れてください"), occupation: text(100),
  careerSummary: text(20000), reasonForChange: text(5000),
});
export const linkInputSchema = z.object({
  companyName: text(200).min(1, "病院・会社の名前を入れてください"), position: text(200), jobDescription: text(20000),
  stage: z.enum(["first", "second", "final"], { error: "選考段階を選んでください" }),
  style: z.enum(["gentle", "standard", "strict"], { error: "面接官の雰囲気を選んでください" }),
  durationMin: z.union([z.literal(5), z.literal(15), z.literal(30)], { error: "時間を選んでください" }),
});
export type SeekerInput = z.infer<typeof seekerInputSchema>;
export type LinkInput = z.infer<typeof linkInputSchema>;
export function firstIssue(error: z.ZodError): string { return error.issues[0]?.message ?? "入力内容を確かめてください"; }
