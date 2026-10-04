import { describe, expect, it } from "vitest";
import { MockInterviewer } from "@/lib/ai/mock";
import type { QuestionPlan } from "@/lib/ai/schemas/plan";
import { renderSessionContext } from "@/lib/ai/session-context";
import type { CandidateContext, SessionSettings } from "@/lib/interview/types";
import { pickBrowserVoice } from "@/lib/speech/voices";

const settings: SessionSettings = { stage: "first", style: "standard", durationMin: 15, interviewerModel: "sonnet", voiceId: "male_a" };
const context: CandidateContext = { companyName: "株式会社サンプル", position: "営業", jobDescription: "", careerSummary: "", reasonForChange: "" };
const plan: QuestionPlan = { questions: [], stt_keywords: [] };

describe("面接官の名前", () => {
  it("アバターの名前を面接設定に入れ、なければ「指定なし」とする", () => {
    expect(renderSessionContext({ ...settings, interviewerName: "佐藤 健一" }, context, plan)).toContain("面接官の名前: 佐藤 健一");
    expect(renderSessionContext(settings, context, plan)).toContain("面接官の名前: (指定なし)");
  });

  it("模擬AIも、指定された名字で名乗る", async () => {
    const opening = async (sessionContext: string) => {
      const result = await new MockInterviewer().stream(
        { modelKey: "sonnet", sessionContext, messages: [{ role: "user", content: "面接を開始してください。" }] },
        () => undefined,
        new AbortController().signal,
      );
      return result.content[0].type === "text" ? result.content[0].text : "";
    };
    expect(await opening(renderSessionContext({ ...settings, interviewerName: "佐藤 健一" }, context, plan))).toContain("担当いたします佐藤です");
    expect(await opening(renderSessionContext(settings, context, plan))).not.toMatch(/山田|佐藤/);
  });
});

describe("pickBrowserVoice", () => {
  const voices = [
    { name: "Google US English", lang: "en-US" },
    { name: "Google 日本語", lang: "ja-JP" },
    { name: "Microsoft Ayumi - Japanese (Japan)", lang: "ja-JP" },
    { name: "Microsoft Ichiro - Japanese (Japan)", lang: "ja-JP" },
  ];

  it("アバターの性別に合う日本語の声を選ぶ", () => {
    expect(pickBrowserVoice(voices, "male")?.name).toContain("Ichiro");
    expect(pickBrowserVoice(voices, "female")?.name).toBe("Google 日本語");
  });

  it("Edge などの高品質な声があれば、そちらを優先する", () => {
    const edge = [
      ...voices,
      { name: "Microsoft Nanami Online (Natural) - Japanese (Japan)", lang: "ja-JP" },
      { name: "Microsoft Keita Online (Natural) - Japanese (Japan)", lang: "ja-JP" },
    ];
    expect(pickBrowserVoice(edge, "male")?.name).toContain("Keita Online");
    expect(pickBrowserVoice(edge, "female")?.name).toContain("Nanami Online");
    expect(pickBrowserVoice(edge)?.name).toContain("Online (Natural)");
  });

  it("合う声がなければ、最初の日本語の声を使う", () => {
    expect(pickBrowserVoice(voices.slice(0, 2), "male")?.name).toBe("Google 日本語");
    expect(pickBrowserVoice([{ name: "Samantha", lang: "en-US" }], "male")).toBeUndefined();
    expect(pickBrowserVoice(voices)?.name).toBe("Google 日本語");
  });
});
