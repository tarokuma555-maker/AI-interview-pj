import { describe, expect, it } from "vitest";
import type { InterviewerModel, InterviewerRequest, InterviewerResult } from "@/lib/ai/interviewer";
import { hasValidSystemPlacement } from "@/lib/ai/messages";
import { FORCED_CLOSING_TEXT, REFUSAL_FALLBACK_TEXT } from "@/lib/ai/prompts/interviewer";
import { FORCE_CLOSE_GRACE_MS } from "@/lib/interview/phase";
import { runTurn, type TurnInput } from "@/lib/interview/turn-engine";
import { INITIAL_SESSION_STATE, type SessionSettings, type TurnEvent } from "@/lib/interview/types";
import type { TtsClient } from "@/lib/speech/tts/types";

const settings: SessionSettings = { stage: "first", style: "standard", durationMin: 15, interviewerModel: "sonnet", voiceId: "female_a" };
const MIN = 60_000;

/** 決まった文字列を、指定した区切りで少しずつ返す模擬面接官 */
class ScriptedInterviewer implements InterviewerModel {
  requests: InterviewerRequest[] = [];
  constructor(
    private readonly chunks: string[],
    private readonly stopReason: string = "end_turn",
  ) {}
  async stream(request: InterviewerRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<InterviewerResult> {
    this.requests.push(request);
    for (const chunk of this.chunks) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      onText(chunk);
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return { content: [{ type: "text", text: this.chunks.join("") }], stopReason: this.stopReason, usage: null };
  }
  async prewarm() {}
}

/** 文ごとに遅延を変えて、完了順が入れ替わる音声合成 */
class DelayedTts implements TtsClient {
  async synthesize(text: string) {
    await new Promise((resolve) => setTimeout(resolve, text.length % 2 === 0 ? 20 : 1));
    return { format: "mp3" as const, data: new TextEncoder().encode(text), characters: text.length };
  }
}

async function collect(input: Partial<TurnInput>, interviewer: InterviewerModel, now = 0, signal = new AbortController().signal) {
  const events: TurnEvent[] = [];
  const full: TurnInput = {
    kind: "answer",
    settings,
    sessionContext: "<面接設定></面接設定>",
    history: [{ speaker: "interviewer", text: "自己紹介をお願いします。" }],
    state: { startedAt: 0, phase: "opening", noticesSent: [] },
    answer: { text: "法人営業を6年担当しています。", inputMode: "voice", speechMs: 6000 },
    reply: true,
    ...input,
  };
  for await (const event of runTurn(full, { interviewer, tts: new DelayedTts(), signal, now: () => now })) events.push(event);
  return events;
}

/** 面接官が話した文をつなげたもの */
function spoken(events: TurnEvent[]): string {
  return events.flatMap((e) => (e.type === "sentence" ? [e.text] : [])).join("");
}

describe("runTurn", () => {
  it("回答を保存し、文と音声を順番どおりに返す", async () => {
    const interviewer = new ScriptedInterviewer(["ありがとうございます。転職", "理由を教えてくだ", "さい。"]);
    const events = await collect({}, interviewer);

    expect(events[0]).toMatchObject({ type: "ack", appended: [{ speaker: "candidate", text: "法人営業を6年担当しています。", charsPerMinute: 140 }] });
    expect(events.filter((e) => e.type === "sentence").map((e) => (e as { text: string }).text)).toEqual([
      "ありがとうございます。",
      "転職理由を教えてください。",
    ]);
    expect(events.filter((e) => e.type === "audio").map((e) => (e as { index: number }).index)).toEqual([0, 1]);
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", isClosing: false, sentenceCount: 2, state: { phase: "main" } });
    expect(done?.type === "done" && done.interviewerTurn?.text).toBe("ありがとうございます。転職理由を教えてください。");
  });

  it("開始時は開始時刻を記録する", async () => {
    const events = await collect(
      { kind: "start", history: [], state: INITIAL_SESSION_STATE, answer: undefined },
      new ScriptedInterviewer(["本日はよろしくお願いいたします。"]),
      1234,
    );
    expect(events[0]).toMatchObject({ type: "ack", appended: [], state: { startedAt: 1234 } });
  });

  it("制御タグでフェーズを切り替え、[[END]] で面接を締めくくる", async () => {
    const reverse = await collect({ state: { startedAt: 0, phase: "main", noticesSent: [] } }, new ScriptedInterviewer(["何かご質問はありますか。[[REVERSE]]"]));
    expect(reverse.find((e) => e.type === "phase")).toEqual({ type: "phase", phase: "reverse_questions" });

    const end = await collect({}, new ScriptedInterviewer(["本日は以上です。[[END]]"]));
    expect(end.at(-1)).toMatchObject({ type: "done", isClosing: true, state: { phase: "ended" } });
  });

  it("残り時間の通知は、求職者の発言の直後にシステムターンとして追記する", async () => {
    const interviewer = new ScriptedInterviewer(["承知しました。"]);
    const events = await collect({ state: { startedAt: 0, phase: "main", noticesSent: [] } }, interviewer, 12.5 * MIN);
    const ack = events[0];
    expect(ack.type === "ack" && ack.appended.map((t) => t.speaker)).toEqual(["candidate", "system"]);
    expect(hasValidSystemPlacement(interviewer.requests[0].messages)).toBe(true);
    expect(events.at(-1)).toMatchObject({ state: { noticesSent: ["time_warning"] } });
  });

  it("割り込まれた場合は、聞こえていた範囲をAIに伝える", async () => {
    const interviewer = new ScriptedInterviewer(["なるほど。"]);
    await collect(
      {
        history: [{ speaker: "interviewer", text: "ありがとうございます。次に転職理由を", sentences: ["ありがとうございます。", "次に転職理由を"] }],
        previous: { playedSentences: 1, interrupted: true },
      },
      interviewer,
    );
    const last = interviewer.requests[0].messages.at(-1);
    expect(last?.role).toBe("system");
    expect(String(last?.content)).toContain("「ありがとうございます。」まで");
  });

  it("応答が拒否されて何も話せなかったときは、定型の言い直しを返す", async () => {
    const events = await collect({}, new ScriptedInterviewer([], "refusal"));
    expect(spoken(events)).toBe(REFUSAL_FALLBACK_TEXT);
  });

  it("設定時間を大きく超えたら、AIを呼ばずに締めくくる", async () => {
    const interviewer = new ScriptedInterviewer(["呼ばれないはず。"]);
    const events = await collect({ state: { startedAt: 0, phase: "main", noticesSent: [] } }, interviewer, 15 * MIN + FORCE_CLOSE_GRACE_MS);
    expect(interviewer.requests).toHaveLength(0);
    expect(spoken(events)).toBe(FORCED_CLOSING_TEXT);
    expect(events.at(-1)).toMatchObject({ type: "done", isClosing: true });
  });

  it("空の回答はエラーにする", async () => {
    const events = await collect({ answer: { text: "  ", inputMode: "text" } }, new ScriptedInterviewer(["はい。"]));
    expect(events).toEqual([{ type: "error", code: "EMPTY_ANSWER", message: "回答が空です", retryable: false }]);
  });

  it("中断されたら、エラーを返さずに終わる", async () => {
    const abort = new AbortController();
    const interviewer = new ScriptedInterviewer(["ひとつめ。", "ふたつめ。", "みっつめ。"]);
    const events: TurnEvent[] = [];
    const input: TurnInput = {
      kind: "answer",
      settings,
      sessionContext: "",
      history: [],
      state: { startedAt: 0, phase: "main", noticesSent: [] },
      answer: { text: "はい。", inputMode: "voice" },
      reply: true,
    };
    for await (const event of runTurn(input, { interviewer, tts: null, signal: abort.signal, now: () => 0 })) {
      events.push(event);
      if (event.type === "sentence") abort.abort();
    }
    expect(events.some((e) => e.type === "error" || e.type === "done")).toBe(false);
  });
});
