import { afterEach, describe, expect, it, vi } from "vitest";
import { mockFeedback } from "@/lib/ai/mock";
import { FEEDBACK_AXES, normalizeFeedback, type FeedbackOutput } from "@/lib/ai/schemas/feedback";
import type { TurnRecord } from "@/lib/interview/types";
import { answerMetrics, judgeDelay, judgeLength, judgeRate } from "@/lib/interview/speech-metrics";

const parse = vi.fn();
vi.mock("@/lib/ai/client", () => ({ getAnthropic: () => ({ beta: { messages: { parse } } }) }));

const { generateFeedback, NoAnswerError, renderFeedbackRequest } = await import("@/lib/ai/feedback");

const HISTORY: TurnRecord[] = [
  { speaker: "interviewer", text: "本日はよろしくお願いいたします。まずは自己紹介をお願いします。" },
  { speaker: "candidate", text: "看護師として8年間、内科病棟で勤務してきました。", inputMode: "voice", speechMs: 150_000, responseDelayMs: 1200 },
  { speaker: "system", text: "残り時間の通知" },
  { speaker: "interviewer", text: "転職を考えたきっかけを教えてください。[[REVERSE]]" },
  { speaker: "candidate", text: "急性期の看護を学びたいと考えたためです。", inputMode: "text" },
];

const SETTINGS = { stage: "first", style: "standard", durationMin: 5, interviewerModel: "sonnet", voiceId: "male_a" } as const;
const CONTEXT = { companyName: "サンプル総合病院", position: "看護師", jobDescription: "急性期病棟", careerSummary: "内科病棟8年", reasonForChange: "急性期を学びたい" };

function output(overrides: Partial<FeedbackOutput> = {}): FeedbackOutput {
  return {
    summary: " 総評です。 ",
    axes: FEEDBACK_AXES.map((key) => ({ key, score: 4, reason: "理由", evidence_turn_seqs: [2] })),
    strengths: ["a", "b", "c", "d"],
    improvements: ["x"],
    answers: [
      { turn_seq: 2, rating: 4, good_points: ["良い"], improvements: ["改善"], improved_answer: "例", uses_assumed_content: false },
      { turn_seq: 4, rating: 3, good_points: [], improvements: [], improved_answer: "", uses_assumed_content: false },
    ],
    next_actions: [
      { title: "1", detail: "d", category: "motivation" },
      { title: "2", detail: "d", category: "motivation" },
      { title: "3", detail: "d", category: "motivation" },
      { title: "4", detail: "d", category: "motivation" },
    ],
    ...overrides,
  };
}

describe("話し方の計測値", () => {
  it("回答ごとに、通し番号・直前の質問・声で答えた場合の計測値を出す(システムの通知は数えない)", () => {
    const metrics = answerMetrics(HISTORY);
    expect(metrics.map((m) => m.turn_seq)).toEqual([2, 4]);
    expect(metrics[0]).toMatchObject({ question: "本日はよろしくお願いいたします。まずは自己紹介をお願いします。", speechSec: 150, responseDelaySec: 1.2, isIntroduction: true });
    expect(metrics[1]).toMatchObject({ question: "転職を考えたきっかけを教えてください。", inputMode: "text", isIntroduction: false, isReverseQuestion: true });
    expect(metrics[0].isReverseQuestion).toBe(false);
    expect(metrics[1].speechSec).toBeUndefined();
  });

  it("記録に残した段階から、逆質問の場面での発言を見分ける(面接官の発言から印が取り除かれていても)", () => {
    const metrics = answerMetrics([
      { speaker: "interviewer", text: "自己紹介をお願いします。" },
      { speaker: "candidate", text: "看護師です。", phase: "opening" },
      { speaker: "interviewer", text: "最後に、何かご質問はありますか。" },
      { speaker: "candidate", text: "夜勤の体制を教えてください。", phase: "reverse_questions" },
    ]);
    expect(metrics.map((m) => m.isReverseQuestion)).toEqual([false, true]);
  });

  it("目安と比べる(自己紹介は長めの目安)", () => {
    const [intro] = answerMetrics(HISTORY);
    expect(judgeLength(intro)).toBe("ok");
    expect(judgeLength({ ...intro, isIntroduction: false })).toBe("long");
    expect(judgeLength({ ...intro, isIntroduction: false, speechSec: 20 })).toBe("short");
    expect(judgeRate({ ...intro, charsPerMinute: 300 })).toBe("ok");
    expect(judgeRate({ ...intro, charsPerMinute: 400 })).toBe("long");
    expect(judgeDelay({ ...intro, responseDelaySec: 7 })).toBe("long");
  });
});

describe("normalizeFeedback", () => {
  it("観点を決まった順にそろえ、範囲と件数を整え、総合スコアを観点別評価から計算する", () => {
    const feedback = normalizeFeedback(
      output({
        axes: [
          { key: "delivery", score: 9, reason: "r", evidence_turn_seqs: [2, 99] },
          { key: "logic", score: 2, reason: "r", evidence_turn_seqs: [] },
        ],
        answers: [
          ...output().answers,
          { turn_seq: 2, rating: 1, good_points: [], improvements: [], improved_answer: "重複", uses_assumed_content: false },
          { turn_seq: 7, rating: 5, good_points: [], improvements: [], improved_answer: "存在しない回答", uses_assumed_content: false },
        ],
      }),
      [2, 4],
    );
    expect(feedback.axes.map((a) => a.key)).toEqual([...FEEDBACK_AXES]);
    expect(feedback.axes.find((a) => a.key === "delivery")).toMatchObject({ score: 5, evidence_turn_seqs: [2] });
    // 欠けた観点は 3。(2 + 3 + 3 + 3 + 3 + 5) / 6 × 20 = 63
    expect(feedback.overall_score).toBe(63);
    expect(feedback.answers.map((a) => a.turn_seq)).toEqual([2, 4]);
    expect(feedback.answers[0].improved_answer).toBe("例");
    expect(feedback.strengths).toHaveLength(3);
    expect(feedback.next_actions).toHaveLength(3);
    expect(feedback.summary).toBe("総評です。");
  });
});

describe("generateFeedback", () => {
  afterEach(() => parse.mockReset());

  it("面接の記録に番号を付け、計測値と一緒に渡す", () => {
    const request = renderFeedbackRequest({ settings: SETTINGS, context: CONTEXT, plan: null, history: HISTORY }, answerMetrics(HISTORY));
    expect(request).toContain("[1] 面接官: 本日はよろしくお願いいたします。");
    expect(request).toContain("[2] 求職者: 看護師として8年間");
    expect(request).toContain("[3] 面接官(逆質問を促す): 転職を考えたきっかけを教えてください。");
    expect(request).toContain("[4] 求職者(逆質問): 急性期の看護を学びたい");
    expect(request).not.toContain("[[REVERSE]]");
    expect(request).toContain("[2] 回答の長さ 150秒");
    expect(request).toContain("[4] 文字で入力(計測値なし)");
    expect(request).toContain("評価する回答の番号: 2, 4");
  });

  it("高い effort で生成し、形式の誤りなら1回だけ作り直す", async () => {
    parse.mockResolvedValueOnce({ stop_reason: "max_tokens", parsed_output: null }).mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: output() });
    const { feedback, metrics } = await generateFeedback({ settings: SETTINGS, context: CONTEXT, plan: null, history: HISTORY });
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse.mock.calls[0][0].output_config.effort).toBe("high");
    expect(parse.mock.calls[0][0].model).toBe("claude-opus-5-5");
    expect(parse.mock.calls[1][0].output_config.effort).toBe("medium");
    expect(feedback.overall_score).toBe(80);
    expect(metrics).toHaveLength(2);
  });

  it("回答がなければ評価しない", async () => {
    await expect(generateFeedback({ settings: SETTINGS, context: CONTEXT, plan: null, history: HISTORY.slice(0, 1) })).rejects.toBeInstanceOf(NoAnswerError);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("mockFeedback", () => {
  it("すべての回答に講評を付ける", () => {
    const { feedback } = mockFeedback({ settings: SETTINGS, context: CONTEXT, plan: null, history: HISTORY });
    expect(feedback.answers.map((a) => a.turn_seq)).toEqual([2, 4]);
    expect(feedback.next_actions).toHaveLength(3);
  });
});
