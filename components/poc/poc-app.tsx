"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InterviewController, type ControllerConfig } from "@/features/interview/client/interview-controller";
import { ApiError, fetchConfig, fetchGoogleVoices, type PocConfig } from "@/features/interview/client/poc-api";
import { previewVoice, stopPreview } from "@/features/interview/client/voice-preview";
import { isWebSpeechSupported } from "@/features/interview/client/stt/web-speech";
import { VOICES, type VoiceGender } from "@/lib/speech/voices";
import { DEFAULT_AVATAR_SETTINGS, parseAvatarSettings, resolveAvatar, type AvatarSettings } from "@/features/avatar/settings";
import { AvatarPicker } from "./avatar-picker";
import { DEFAULT_CONTEXT, SetupForm, type SetupValues, type VoiceTools } from "./setup-form";
import { RoomView } from "./room-view";

const CODE_KEY = "poc-access-code";
const FORM_KEY = "poc-setup";
const AVATAR_KEY = "poc-avatar";

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // 保存できなくても動作は続ける
    return false;
  }
}

export function PocApp() {
  const codeInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [config, setConfig] = useState<PocConfig | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [initial, setInitial] = useState<SetupValues | null>(null);
  const [controller, setController] = useState<InterviewController | null>(null);
  const [avatar, setAvatar] = useState<AvatarSettings>(DEFAULT_AVATAR_SETTINGS);
  const [avatarSaveFailed, setAvatarSaveFailed] = useState(false);

  useEffect(() => {
    // 保存済みのアクセスコードは、表示後に入力欄へ入れる(サーバーでの描画と揃えるため)
    const savedCode = load<string>(CODE_KEY);
    if (savedCode && codeInput.current && !codeInput.current.value) codeInput.current.value = savedCode;
  }, []);

  useEffect(() => () => controller?.dispose(), [controller]);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const entered = codeInput.current?.value.trim() ?? "";
    setChecking(true);
    setCodeError(null);
    try {
      const result = await fetchConfig(entered);
      save(CODE_KEY, entered);
      setCode(entered);
      setConfig(result);
      const savedAvatar = parseAvatarSettings(load<unknown>(AVATAR_KEY));
      setAvatar(savedAvatar);
      setInitial(defaultValues(result, load<SetupValues>(FORM_KEY), resolveAvatar(savedAvatar)?.interviewer?.voice));
    } catch (error) {
      setCodeError(error instanceof ApiError ? error.message : "接続できませんでした");
    } finally {
      setChecking(false);
    }
  }

  const interviewer = resolveAvatar(avatar)?.interviewer;
  const voiceTools = useMemo<VoiceTools>(
    () => ({
      loadGoogleVoices: () => fetchGoogleVoices(code),
      preview: (values) =>
        previewVoice({
          accessCode: code,
          provider: values.ttsProvider,
          voice: { id: values.settings.voiceId, pitch: values.settings.voicePitch, rate: values.settings.voiceRate },
          gender: interviewer?.voice,
          text: greeting(interviewer?.name),
        }),
      gender: interviewer?.voice,
    }),
    [code, interviewer?.voice, interviewer?.name],
  );

  function begin(values: SetupValues) {
    stopPreview();
    save(FORM_KEY, values);
    controller?.dispose();
    const next = new InterviewController();
    // 面接官の名前と声は、選んだアバターに合わせる(名札と名乗りを一致させる)
    const interviewer = resolveAvatar(avatar)?.interviewer;
    const controllerConfig: ControllerConfig = {
      accessCode: code,
      ...values,
      settings: { ...values.settings, interviewerName: interviewer?.name },
      voiceGender: interviewer?.voice,
    };
    setController(next);
    void next.prepare(controllerConfig);
  }

  function changeAvatar(next: AvatarSettings) {
    setAvatar(next);
    setAvatarSaveFailed(!save(AVATAR_KEY, next));
  }

  function reset() {
    controller?.dispose();
    setController(null);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold">AI面接練習 音声会話の試作版</h1>
        <p className="text-sm text-muted">
          応答の速さ・話し終わりの判定・エコーを確かめるための試作版です(開発ステップ2)。結果はこの画面の下で確認し、JSONで保存できます。
        </p>
      </header>

      {!config && (
        <form onSubmit={verify} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <label className="flex flex-col gap-2">
            <span className="font-semibold">アクセスコード</span>
            <input
              ref={codeInput}
              type="password"
              className="rounded-lg border border-border bg-background px-3 py-2"
              autoComplete="off"
              required
            />
          </label>
          {codeError && <p className="text-sm text-danger">{codeError}</p>}
          <button
            type="submit"
            disabled={checking}
            className="self-start rounded-lg bg-accent px-4 py-2 font-semibold text-accent-foreground disabled:opacity-50"
          >
            {checking ? "確認しています…" : "はじめる"}
          </button>
        </form>
      )}

      {config && initial && !controller && (
        <SetupForm config={config} initial={initial} onSubmit={begin} voiceTools={voiceTools}>
          <AvatarPicker value={avatar} onChange={changeAvatar} saveFailed={avatarSaveFailed} />
        </SetupForm>
      )}

      {config && controller && <RoomView controller={controller} avatar={resolveAvatar(avatar)} onReset={reset} />}
    </main>
  );
}

/** 「声を試す」で読み上げる、面接官の最初のあいさつ */
function greeting(name: string | undefined): string {
  const surname = name?.trim().split(/\s+/)[0];
  return `本日はお時間をいただきありがとうございます。面接を担当いたします${surname || "人事の者"}です。よろしくお願いいたします。`;
}

function defaultValues(config: PocConfig, saved: SetupValues | null, voiceGender?: VoiceGender): SetupValues {
  const sttDefault = isWebSpeechSupported() ? "webspeech" : "text";
  const ttsDefault = config.googleTts ? "google" : config.azureSpeech ? "azure" : config.aiMode === "mock" ? "mock" : "browser";
  const base: SetupValues = {
    settings: {
      stage: "first",
      style: "standard",
      durationMin: 5,
      interviewerModel: config.interviewerModels[0]?.key ?? "sonnet",
      // Azure の声は、アバターの性別に合う声を最初の選択にする
      voiceId: VOICES.find((v) => v.gender === voiceGender && config.voices.some((c) => c.id === v.id))?.id ?? config.voices[0]?.id ?? "female_a",
    },
    context: DEFAULT_CONTEXT,
    sttProvider: config.azureSpeech ? "azure" : sttDefault,
    ttsProvider: ttsDefault,
    earphones: false,
  };
  if (!saved) return base;
  return {
    ...base,
    ...saved,
    settings: { ...base.settings, ...saved.settings },
    context: { ...base.context, ...saved.context },
    sttProvider: saved.sttProvider === "azure" && !config.azureSpeech ? base.sttProvider : saved.sttProvider,
    ttsProvider:
      (saved.ttsProvider === "azure" && !config.azureSpeech) || (saved.ttsProvider === "google" && !config.googleTts)
        ? base.ttsProvider
        : saved.ttsProvider,
  };
}
