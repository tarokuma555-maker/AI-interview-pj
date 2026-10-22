import { describe, expect, it } from "vitest";
import { buildContext, buildControllerConfig, chooseServices, currentChoice, FIRST_CHOICE, SLOW_RATE } from "@/features/app/interview-setup";
import { extractInviteCode } from "@/features/app/invite";
import { isInAppBrowser, micPermissionHelp, preparingLabel, prepareProblem, roomMessage } from "@/features/app/messages";
import { occupationLabel } from "@/features/app/occupations";
import { EMPTY_DATA, parseData, type AppData } from "@/features/app/store";
import type { PocConfig } from "@/features/interview/client/poc-api";
import { renderSessionContext } from "@/lib/ai/session-context";

const CONFIG: PocConfig = {
  aiMode: "live",
  azureSpeech: false,
  googleTts: true,
  googleStt: true,
  interviewerModels: [
    { key: "opus", label: "Opus" },
    { key: "sonnet", label: "Sonnet" },
  ],
  voices: [],
  interviewerVoices: { google: "ja-JP-Chirp3-HD-Test", azure: "male_a" },
};

const DATA: AppData = {
  ...EMPTY_DATA,
  accessCode: "code",
  profile: { occupation: "nurse", occupationOther: "", careerSummary: "内科病棟8年", reasonForChange: "急性期を学びたい" },
  companies: [{ id: "c1", name: "サンプル総合病院", position: "看護師(内科病棟)", jobDescription: "急性期病棟", updatedAt: "" }],
};

describe("面接の設定(利用者は技術的な設定を選ばない。要件 D-13)", () => {
  it("応募先を指定しないときは、職種の一般的な面接にする", () => {
    const context = buildContext(DATA, FIRST_CHOICE);
    expect(context.companyName).toBe("");
    expect(context.position).toBe("看護師");
    expect(context.jobDescription).toContain("看護師の中途採用");
    expect(context.careerSummary).toBe("内科病棟8年");
  });

  it("応募先を選んだら、その求人の内容を使う", () => {
    const context = buildContext(DATA, { ...FIRST_CHOICE, companyId: "c1" });
    expect(context).toMatchObject({ companyName: "サンプル総合病院", position: "看護師(内科病棟)", jobDescription: "急性期病棟" });
  });

  it("消された応募先を指していた前回の設定は、応募先なしに戻す", () => {
    expect(currentChoice({ ...DATA, lastChoice: { ...FIRST_CHOICE, companyId: "gone" } }).companyId).toBeNull();
    expect(currentChoice({ ...DATA, lastChoice: null }).durationMin).toBe(15);
  });

  it("Google Cloud が使えれば、聞き取りも読み上げも Google Cloud にし、面接官の声はサーバーが決めた声にする", () => {
    expect(chooseServices(CONFIG, "voice", false)).toEqual({ stt: "google", tts: "google", voiceId: "ja-JP-Chirp3-HD-Test" });
    expect(chooseServices(CONFIG, "text", true).stt).toBe("text");
  });

  it("Google Cloud が使えないときは、使えるものに切り替える", () => {
    const none = { ...CONFIG, googleStt: false, googleTts: false };
    expect(chooseServices(none, "voice", true)).toEqual({ stt: "webspeech", tts: "browser", voiceId: "male_a" });
    expect(chooseServices(none, "voice", false).stt).toBe("text");
    expect(chooseServices({ ...none, azureSpeech: true }, "voice", false)).toEqual({ stt: "azure", tts: "azure", voiceId: "male_a" });
    expect(chooseServices({ ...CONFIG, interviewerVoices: { google: null, azure: "male_a" } }, "voice", false).tts).toBe("browser");
  });

  it("面接官は Opus 5.5 の佐藤 健一。ゆっくりを選んだら話す速さを落とす", () => {
    const slow = { ...DATA, preferences: { ...DATA.preferences, speechRate: "slow" as const, earphones: true } };
    const config = buildControllerConfig(slow, FIRST_CHOICE, CONFIG, "code", false);
    expect(config.settings).toMatchObject({ interviewerModel: "opus", interviewerName: "佐藤 健一", voiceRate: SLOW_RATE, durationMin: 5, style: "gentle" });
    expect(config).toMatchObject({ sttProvider: "google", ttsProvider: "google", earphones: true, voiceGender: "male", accessCode: "code" });
    expect(buildControllerConfig(DATA, FIRST_CHOICE, CONFIG, "code", false).settings.voiceRate).toBeUndefined();
  });

  it("文字で答える面接では、面接官に回答方法を伝える", () => {
    const plan = { questions: [], stt_keywords: [] } as never;
    const base = buildControllerConfig(DATA, FIRST_CHOICE, CONFIG, "code", false);
    expect(renderSessionContext({ ...base.settings, answerBy: "text" }, base.context, plan)).toContain("回答方法: 文字の入力");
    expect(renderSessionContext({ ...base.settings, answerBy: "voice" }, base.context, plan)).toContain("回答方法: 音声");
  });
});

describe("職種", () => {
  it("「そのほか」は書いてもらった職種名にする", () => {
    expect(occupationLabel("pt", "")).toBe("理学療法士");
    expect(occupationLabel("other", " 病院の総務 ")).toBe("病院の総務");
    expect(occupationLabel(null, "")).toBe("(職種の指定なし)");
  });
});

describe("招待リンク", () => {
  it.each([
    ["#abc123", "abc123"],
    ["https://example.com/join#abc123", "abc123"],
    ["  abc123  ", "abc123"],
    ["#%E3%83%86%E3%82%B9%E3%83%88", "テスト"],
    ["#%E3%83", "%E3%83"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(extractInviteCode(input)).toBe(expected);
  });
});

describe("保存していたデータの読み込み", () => {
  it("足りない項目は初期値で埋め、試作版のアクセスコードを引き継ぐ", () => {
    const data = parseData({ profile: { occupation: "nurse" }, companies: "broken" }, "poc-code");
    expect(data.profile).toEqual({ ...EMPTY_DATA.profile, occupation: "nurse" });
    expect(data.preferences).toEqual(EMPTY_DATA.preferences);
    expect(data.companies).toEqual([]);
    expect(data.accessCode).toBe("poc-code");
    expect(parseData({ accessCode: "app-code" }, "poc-code").accessCode).toBe("app-code");
    expect(parseData(null, null)).toEqual(EMPTY_DATA);
  });
});

describe("画面に出すメッセージ(技術的な言葉を出さない。要件 UX-02)", () => {
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
  const LINE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari Line/14.0.0";

  it("準備中の表示に「音声認識」を出さない", () => {
    expect(preparingLabel("音声認識を準備しています…")).toBe("声の聞き取りを準備しています…");
    expect(preparingLabel("質問を準備しています…")).toContain("質問");
    expect(preparingLabel(null)).toBe("準備しています…");
  });

  it("マイクが許可されていないときは、端末に合った直し方を示し、文字での面接を選べる", () => {
    const problem = prepareProblem("マイクの使用が許可されていません。ブラウザの設定でマイクを許可してください", IPHONE);
    expect(problem.title).toBe("マイクが使えません");
    expect(problem.detail).toContain("「設定」→「Safari」→「マイク」");
    expect(problem.canUseText).toBe(true);
    expect(micPermissionHelp(LINE)).toContain("ブラウザで開く");
    expect(isInAppBrowser(LINE)).toBe(true);
    expect(isInAppBrowser(IPHONE)).toBe(false);
  });

  it("通信のエラーは番号を出さず、次にやることを示す", () => {
    expect(prepareProblem("通信に失敗しました(500)", IPHONE)).toMatchObject({ title: "準備がうまくいきませんでした", canUseText: true });
    expect(prepareProblem("アクセスコードが正しくありません", IPHONE).canUseText).toBe(false);
    expect(roomMessage("通信に失敗しました(502)")).not.toMatch(/\d/);
    expect(roomMessage("音声を文字にできませんでした。もう一度お話しください")).toBe("うまく聞き取れませんでした。もう一度お話しください。");
    expect(roomMessage(null)).toBeNull();
  });
});
