import { describe, expect, it } from "vitest";
import { FORCE_CLOSE_GRACE_MS, checkTime, interruptionNotice } from "@/lib/interview/phase";
import type { SessionSettings, SessionState } from "@/lib/interview/types";

const settings: SessionSettings = { stage: "first", style: "standard", durationMin: 15, interviewerModel: "sonnet", voiceId: "female_a" };
const MIN = 60_000;
const state = (patch: Partial<SessionState> = {}): SessionState => ({ startedAt: 0, phase: "main", noticesSent: [], ...patch });

describe("checkTime", () => {
  it("開始前は何もしない", () => {
    expect(checkTime(settings, state({ startedAt: null }), 0)).toEqual({ notices: [], forceClose: false, remainingMs: null });
  });

  it("残り時間が20%(15分なら3分)を切ったら一度だけ通知する", () => {
    expect(checkTime(settings, state(), 11 * MIN).notices).toEqual([]);
    expect(checkTime(settings, state(), 12 * MIN).notices.map((n) => n.key)).toEqual(["time_warning"]);
    expect(checkTime(settings, state({ noticesSent: ["time_warning"] }), 12.5 * MIN).notices).toEqual([]);
  });

  it("短い面接でも、最低2分前には通知する", () => {
    const short = { ...settings, durationMin: 5 as const };
    expect(checkTime(short, state(), 2.9 * MIN).notices).toEqual([]);
    expect(checkTime(short, state(), 3 * MIN).notices.map((n) => n.key)).toEqual(["time_warning"]);
  });

  it("逆質問に入っていれば残り時間の通知はしない", () => {
    expect(checkTime(settings, state({ phase: "reverse_questions" }), 12 * MIN).notices).toEqual([]);
  });

  it("時間切れになったらクロージングを指示する", () => {
    const result = checkTime(settings, state({ noticesSent: ["time_warning"] }), 15 * MIN);
    expect(result.notices.map((n) => n.key)).toEqual(["time_up"]);
    expect(result.notices[0].text).toContain("[[END]]");
  });

  it("設定時間を3分超えたら、サーバーが面接を締めくくる", () => {
    expect(checkTime(settings, state(), 15 * MIN + FORCE_CLOSE_GRACE_MS).forceClose).toBe(true);
  });
});

describe("interruptionNotice", () => {
  it("再生済みの文までを伝える", () => {
    expect(interruptionNotice(["ありがとうございます。", "次に、", "転職理由を教えてください。"], 2)).toContain(
      "「ありがとうございます。次に、」まで",
    );
  });

  it("1文も再生していなければ、聞こえていないと伝える", () => {
    expect(interruptionNotice(["ありがとうございます。"], 0)).toContain("聞こえていません");
  });
});
