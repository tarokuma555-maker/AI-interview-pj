"use client";

import { useEffect, useRef, useState } from "react";
import { InterviewController, type ControllerConfig } from "@/features/interview/client/interview-controller";
import { ApiError, fetchConfig, type PocConfig } from "@/features/interview/client/poc-api";
import { isWebSpeechSupported } from "@/features/interview/client/stt/web-speech";
import { DEFAULT_CONTEXT, SetupForm, type SetupValues } from "./setup-form";
import { RoomView } from "./room-view";

const CODE_KEY = "poc-access-code";
const FORM_KEY = "poc-setup";

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても動作は続ける
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
      setInitial(defaultValues(result, load<SetupValues>(FORM_KEY)));
    } catch (error) {
      setCodeError(error instanceof ApiError ? error.message : "接続できませんでした");
    } finally {
      setChecking(false);
    }
  }

  function begin(values: SetupValues) {
    save(FORM_KEY, values);
    controller?.dispose();
    const next = new InterviewController();
    const controllerConfig: ControllerConfig = { accessCode: code, ...values };
    setController(next);
    void next.prepare(controllerConfig);
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

      {config && initial && !controller && <SetupForm config={config} initial={initial} onSubmit={begin} />}

      {config && controller && <RoomView controller={controller} onReset={reset} />}
    </main>
  );
}

function defaultValues(config: PocConfig, saved: SetupValues | null): SetupValues {
  const sttDefault = isWebSpeechSupported() ? "webspeech" : "text";
  const ttsDefault = config.azureSpeech ? "azure" : config.aiMode === "mock" ? "mock" : "browser";
  const base: SetupValues = {
    settings: {
      stage: "first",
      style: "standard",
      durationMin: 5,
      interviewerModel: config.interviewerModels[0]?.key ?? "sonnet",
      voiceId: config.voices[0]?.id ?? "female_a",
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
    ttsProvider: saved.ttsProvider === "azure" && !config.azureSpeech ? base.ttsProvider : saved.ttsProvider,
  };
}
