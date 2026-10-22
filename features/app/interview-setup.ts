import { STANDARD_AVATAR } from "@/features/avatar/manifest";
import type { ControllerConfig } from "@/features/interview/client/interview-controller";
import type { PocConfig } from "@/features/interview/client/poc-api";
import type { CandidateContext, Stage, Style } from "@/lib/interview/types";
import type { SttProvider, TtsProvider } from "@/lib/speech/voices";
import { occupationLabel } from "./occupations";
import type { AppData, InterviewChoice } from "./store";

/**
 * 利用者が選んだ面接の設定から、面接の進行に必要な設定を作る(要件 D-13)。
 * 音声認識・音声合成・AIモデル・面接官の顔と声は、利用者に選ばせずここで決める。
 */

/** はじめての面接(要件 F-13-4):短く、やさしく、応募先を指定しない */
export const FIRST_CHOICE: InterviewChoice = { companyId: null, stage: "first", style: "gentle", durationMin: 5, answerBy: "voice" };
export const DEFAULT_CHOICE: InterviewChoice = { companyId: null, stage: "first", style: "standard", durationMin: 15, answerBy: "voice" };

/** 画面に出す選考段階(医療機関で多い面接官の例を添える。要件 F-04-3) */
export const STAGE_CHOICES: { value: Stage; label: string; hint: string }[] = [
  { value: "first", label: "一次面接", hint: "人事・事務長など" },
  { value: "second", label: "二次面接", hint: "配属先の責任者・看護部長など" },
  { value: "final", label: "最終面接", hint: "院長・理事長・役員など" },
];

export const STYLE_CHOICES: { value: Style; label: string; hint: string }[] = [
  { value: "gentle", label: "やさしい", hint: "はじめての方に" },
  { value: "standard", label: "ふつう", hint: "本番に近い" },
  { value: "strict", label: "厳しめ", hint: "深掘りが多い" },
];

export const DURATION_CHOICES: { value: InterviewChoice["durationMin"]; label: string }[] = [
  { value: 5, label: "約5分" },
  { value: 15, label: "約15分" },
  { value: 30, label: "約30分" },
];

/** ゆっくりを選んだときの面接官の話す速さ(要件 F-04-9) */
export const SLOW_RATE = 0.9;

/** 前回の設定(消された応募先を指していたら、応募先なしに戻す) */
export function currentChoice(data: AppData): InterviewChoice {
  const choice = { ...DEFAULT_CHOICE, ...data.lastChoice };
  if (choice.companyId && !data.companies.some((c) => c.id === choice.companyId)) choice.companyId = null;
  return choice;
}

/** 面接の前提として AI に渡す、求人と応募書類の情報 */
export function buildContext(data: AppData, choice: InterviewChoice): CandidateContext {
  const occupation = occupationLabel(data.profile.occupation, data.profile.occupationOther);
  const company = choice.companyId ? data.companies.find((c) => c.id === choice.companyId) : undefined;
  return {
    companyName: company?.name.trim() ?? "",
    position: company?.position.trim() || occupation,
    jobDescription: company
      ? company.jobDescription
      : `(応募先の指定なし。${occupation}の中途採用の一般的な求人を想定した練習)`,
    careerSummary: data.profile.careerSummary,
    reasonForChange: data.profile.reasonForChange,
  };
}

/** 使うサービスを決める(使えるものの中で、試作版で決めた順に選ぶ。要件 D-09) */
export function chooseServices(
  config: PocConfig,
  answerBy: InterviewChoice["answerBy"],
  webSpeechSupported: boolean,
): { stt: SttProvider; tts: TtsProvider; voiceId: string } {
  const stt: SttProvider =
    answerBy === "text" ? "text" : config.googleStt ? "google" : webSpeechSupported ? "webspeech" : config.azureSpeech ? "azure" : "text";
  const google = config.googleTts ? config.interviewerVoices.google : null;
  if (google) return { stt, tts: "google", voiceId: google };
  if (config.azureSpeech) return { stt, tts: "azure", voiceId: config.interviewerVoices.azure };
  return { stt, tts: config.aiMode === "mock" ? "mock" : "browser", voiceId: config.interviewerVoices.azure };
}

export function buildControllerConfig(
  data: AppData,
  choice: InterviewChoice,
  config: PocConfig,
  accessCode: string,
  webSpeechSupported: boolean,
): ControllerConfig {
  const services = chooseServices(config, choice.answerBy, webSpeechSupported);
  const interviewer = STANDARD_AVATAR.interviewer;
  return {
    accessCode,
    settings: {
      stage: choice.stage,
      style: choice.style,
      durationMin: choice.durationMin,
      interviewerModel: config.interviewerModels[0]?.key ?? "opus",
      voiceId: services.voiceId,
      voiceRate: data.preferences.speechRate === "slow" ? SLOW_RATE : undefined,
      interviewerName: interviewer?.name,
    },
    context: buildContext(data, choice),
    sttProvider: services.stt,
    ttsProvider: services.tts,
    earphones: data.preferences.earphones,
    voiceGender: interviewer?.voice,
  };
}
