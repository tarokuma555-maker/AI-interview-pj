import { describe, expect, it } from "vitest";
import { buildMessages, hasValidSystemPlacement } from "@/lib/ai/messages";
import { OPENING_USER_MESSAGE } from "@/lib/ai/prompts/interviewer";
import type { TurnRecord } from "@/lib/interview/types";

const history: TurnRecord[] = [
  {
    speaker: "interviewer",
    text: "自己紹介をお願いします。",
    llmContent: [{ type: "text", text: "自己紹介をお願いします。" }],
  },
  { speaker: "candidate", text: "法人営業を6年担当しています。" },
  { speaker: "system", text: "残り時間は約2分です。" },
  {
    speaker: "interviewer",
    text: "ありがとうございます。",
    llmContent: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "ありがとうございます。" },
    ],
  },
];

describe("buildMessages", () => {
  it("固定の開始メッセージから始め、話者ごとに役割を割り当てる", () => {
    const messages = buildMessages(history);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "system", "assistant"]);
    expect(messages[0].content).toBe(OPENING_USER_MESSAGE);
  });

  it("面接官の content ブロック(思考ブロックを含む)を変更せずに返す", () => {
    const messages = buildMessages(history);
    expect(messages[4].content).toEqual(history[3].llmContent);
  });

  it("同じ履歴からは同じリクエストになる(プロンプトキャッシュのため)", () => {
    expect(JSON.stringify(buildMessages(history))).toBe(JSON.stringify(buildMessages(structuredClone(history))));
  });

  it("システムメッセージは求職者の発言の直後に置かれる", () => {
    expect(hasValidSystemPlacement(buildMessages(history))).toBe(true);
  });

  it("面接官の応答が続かなかったシステムメッセージは送らない", () => {
    const interrupted: TurnRecord[] = [
      ...history.slice(0, 3),
      { speaker: "candidate", text: "すみません、補足させてください。" },
    ];
    const messages = buildMessages(interrupted);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "user"]);
    expect(hasValidSystemPlacement(messages)).toBe(true);
  });

  it("最後のシステムメッセージ(今回の通知)は送る", () => {
    const messages = buildMessages(history.slice(0, 3));
    expect(messages.at(-1)).toEqual({ role: "system", content: "残り時間は約2分です。" });
  });

  it("本文が空の面接官ターンは送らない", () => {
    expect(buildMessages([{ speaker: "interviewer", text: "" }])).toHaveLength(1);
  });
});
