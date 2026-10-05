"use client";

import { useEffect, useState } from "react";
import type { ControllerConfig } from "@/features/interview/client/interview-controller";
import type { PocConfig } from "@/features/interview/client/poc-api";
import { isWebSpeechSupported } from "@/features/interview/client/stt/web-speech";
import {
  DURATIONS,
  STAGES,
  STAGE_LABELS,
  STYLES,
  STYLE_LABELS,
  type CandidateContext,
} from "@/lib/interview/types";
import { defaultGoogleVoice, type GoogleVoice } from "@/lib/speech/google-voices";
import {
  STT_PROVIDERS,
  STT_PROVIDER_LABELS,
  TTS_PROVIDERS,
  TTS_PROVIDER_LABELS,
  VOICE_PITCH_RANGE,
  VOICE_RATE_RANGE,
  VOICES,
  type VoiceGender,
} from "@/lib/speech/voices";

export type SetupValues = Omit<ControllerConfig, "accessCode">;

/** 声の一覧の取得と試聴(アクセスコードを持つ親が用意する) */
export type VoiceTools = {
  loadGoogleVoices: () => Promise<GoogleVoice[]>;
  preview: (values: SetupValues) => Promise<void>;
  /** アバターの声の性別(最初に選ぶ声に使う) */
  gender?: VoiceGender;
};

export const DEFAULT_CONTEXT: CandidateContext = {
  companyName: "株式会社サンプル",
  position: "法人営業(SaaS)",
  jobDescription:
    "中小企業向けの業務管理SaaSの法人営業。新規顧客への提案から契約までを担当。法人営業の経験3年以上を歓迎。",
  careerSummary:
    "大学卒業後、事務機器メーカーで法人営業を6年担当。中小企業向けに複合機と保守サービスを提案し、2年連続で売上目標120%を達成。後輩3名の育成も担当。",
  reasonForChange: "ハードウェアの販売から、顧客の業務改善に継続的に関われるSaaSの営業に挑戦したい。",
};

const inputClass = "rounded-lg border border-border bg-background px-3 py-2";

export function SetupForm({
  config,
  initial,
  onSubmit,
  voiceTools,
  children,
}: {
  config: PocConfig;
  initial: SetupValues;
  onSubmit: (values: SetupValues) => void;
  voiceTools: VoiceTools;
  /** 送信ボタンの前に表示する追加の設定 */
  children?: React.ReactNode;
}) {
  const [values, setValues] = useState<SetupValues>(initial);
  const [googleVoices, setGoogleVoices] = useState<GoogleVoice[] | null>(null);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const webSpeech = isWebSpeechSupported();
  const provider = values.ttsProvider;
  const gender = voiceTools.gender ?? "male";

  // Google の声の一覧は、Google を選んだときに1回だけ取得する。いまの声が一覧にない場合は、アバターの性別に合う声を選ぶ
  useEffect(() => {
    if (provider !== "google" || googleVoices) return;
    let cancelled = false;
    voiceTools
      .loadGoogleVoices()
      .then((list) => {
        if (cancelled) return;
        setGoogleVoices(list);
        setVoicesError(null);
        const fallback = defaultGoogleVoice(list, gender);
        setValues((v) =>
          list.some((voice) => voice.id === v.settings.voiceId) || !fallback ? v : { ...v, settings: { ...v.settings, voiceId: fallback.id } },
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setVoicesError(error instanceof Error ? error.message : "声の一覧を取得できませんでした");
      });
    return () => {
      cancelled = true;
    };
  }, [provider, googleVoices, voiceTools, gender]);

  function changeTtsProvider(next: SetupValues["ttsProvider"]) {
    setValues((v) => {
      let voiceId = v.settings.voiceId;
      if (next === "azure" && !config.voices.some((voice) => voice.id === voiceId)) {
        voiceId = VOICES.find((voice) => voice.gender === gender)?.id ?? config.voices[0]?.id ?? voiceId;
      }
      if (next === "google" && googleVoices && !googleVoices.some((voice) => voice.id === voiceId)) {
        voiceId = defaultGoogleVoice(googleVoices, gender)?.id ?? voiceId;
      }
      return { ...v, ttsProvider: next, settings: { ...v.settings, voiceId } };
    });
  }

  async function runPreview() {
    setPreview({ busy: true, error: null });
    try {
      await voiceTools.preview(values);
      setPreview({ busy: false, error: null });
    } catch (error) {
      setPreview({ busy: false, error: error instanceof Error ? error.message : "声を再生できませんでした" });
    }
  }

  const voiceOptions = provider === "google" ? (googleVoices ?? []) : provider === "azure" ? config.voices : [];
  const pitch = values.settings.voicePitch ?? 0;
  const rate = values.settings.voiceRate ?? 1;

  const setSettings = (patch: Partial<SetupValues["settings"]>) =>
    setValues((v) => ({ ...v, settings: { ...v.settings, ...patch } }));
  const setContext = (patch: Partial<CandidateContext>) =>
    setValues((v) => ({ ...v, context: { ...v.context, ...patch } }));

  const sttAvailable = (p: (typeof STT_PROVIDERS)[number]) =>
    p === "azure" ? config.azureSpeech : p === "webspeech" ? webSpeech : true;
  const ttsAvailable = (p: (typeof TTS_PROVIDERS)[number]) =>
    p === "azure" ? config.azureSpeech : p === "google" ? config.googleTts : true;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="flex flex-col gap-6"
    >
      {config.aiMode === "mock" && (
        <p className="rounded-lg border border-border bg-surface p-3 text-sm">
          模擬AIモード(AI_PROVIDER=mock)で動いています。面接官の発言は固定の文面です。
        </p>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold">面接の設定</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="選考段階">
            <select className={inputClass} value={values.settings.stage} onChange={(e) => setSettings({ stage: e.target.value as SetupValues["settings"]["stage"] })}>
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="面接官スタイル">
            <select className={inputClass} value={values.settings.style} onChange={(e) => setSettings({ style: e.target.value as SetupValues["settings"]["style"] })}>
              {STYLES.map((s) => (
                <option key={s} value={s}>{STYLE_LABELS[s]}</option>
              ))}
            </select>
          </Field>
          <Field label="面接時間">
            <select className={inputClass} value={values.settings.durationMin} onChange={(e) => setSettings({ durationMin: Number(e.target.value) as SetupValues["settings"]["durationMin"] })}>
              {DURATIONS.map((d) => (
                <option key={d} value={d}>約{d}分</option>
              ))}
            </select>
          </Field>
          <Field label="面接官のAIモデル">
            <select className={inputClass} value={values.settings.interviewerModel} onChange={(e) => setSettings({ interviewerModel: e.target.value as SetupValues["settings"]["interviewerModel"] })}>
              {config.interviewerModels.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold">音声の設定</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="音声認識">
            <select className={inputClass} value={values.sttProvider} onChange={(e) => setValues((v) => ({ ...v, sttProvider: e.target.value as SetupValues["sttProvider"] }))}>
              {STT_PROVIDERS.map((p) => (
                <option key={p} value={p} disabled={!sttAvailable(p)}>
                  {STT_PROVIDER_LABELS[p]}{sttAvailable(p) ? "" : "(使用不可)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="音声合成">
            <select className={inputClass} value={values.ttsProvider} onChange={(e) => changeTtsProvider(e.target.value as SetupValues["ttsProvider"])}>
              {TTS_PROVIDERS.map((p) => (
                <option key={p} value={p} disabled={!ttsAvailable(p)}>
                  {TTS_PROVIDER_LABELS[p]}{ttsAvailable(p) ? "" : "(使用不可)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="面接官の声">
            <select
              className={inputClass}
              value={voiceOptions.some((v) => v.id === values.settings.voiceId) ? values.settings.voiceId : ""}
              disabled={voiceOptions.length === 0}
              onChange={(e) => setSettings({ voiceId: e.target.value })}
            >
              {voiceOptions.length === 0 && (
                <option value="">
                  {provider === "google" && !voicesError ? "読み込み中…" : provider === "browser" ? "端末の声から自動で選びます" : "選べません"}
                </option>
              )}
              {voiceOptions.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2">
            <input type="checkbox" checked={values.earphones} onChange={(e) => setValues((v) => ({ ...v, earphones: e.target.checked }))} />
            <span>イヤホンを使用中(面接官の発話中に話すと割り込めます)</span>
          </label>
          <Field label={`声の高さ:${pitch > 0 ? "+" : ""}${pitch}(低く ← → 高く)`}>
            <input
              type="range"
              min={VOICE_PITCH_RANGE.min}
              max={VOICE_PITCH_RANGE.max}
              step={VOICE_PITCH_RANGE.step}
              value={pitch}
              disabled={provider === "mock"}
              onChange={(e) => setSettings({ voicePitch: Number(e.target.value) || undefined })}
            />
          </Field>
          <Field label={`話す速さ:${rate.toFixed(2)}倍(ゆっくり ← → 速く)`}>
            <input
              type="range"
              min={VOICE_RATE_RANGE.min}
              max={VOICE_RATE_RANGE.max}
              step={VOICE_RATE_RANGE.step}
              value={rate}
              disabled={provider === "mock"}
              onChange={(e) => setSettings({ voiceRate: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={preview.busy || (provider === "google" && !googleVoices)}
            className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
          >
            {preview.busy ? "準備しています…" : "声を試す"}
          </button>
          {preview.error && <span className="text-danger">{preview.error}</span>}
          {voicesError && <span className="text-danger">{voicesError}</span>}
        </div>
        {!config.googleTts && (
          <p className="text-sm text-muted">
            Google Cloud の声(標準)を使うには、サーバーに GOOGLE_TTS_API_KEY を設定してください(Vercel の環境変数。設定したあとに再デプロイが必要です)。
          </p>
        )}
        {provider === "google" && (
          <p className="text-sm text-muted">
            Chirp 3 HD は最も自然な声(本番の想定で月 約2.3万円)、WaveNet は低価格の声(同 約1,200円)です。試作版は毎月の無料枠の範囲で使えます。声によっては高さ・速さの調整が効かないものがあります(その場合は調整なしで読み上げます)。
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold">応募先と応募書類(試作用のサンプルを入れてあります)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="企業名">
            <input className={inputClass} value={values.context.companyName} maxLength={200} onChange={(e) => setContext({ companyName: e.target.value })} />
          </Field>
          <Field label="ポジション">
            <input className={inputClass} value={values.context.position} maxLength={200} onChange={(e) => setContext({ position: e.target.value })} />
          </Field>
        </div>
        <Field label="求人情報">
          <textarea className={`${inputClass} min-h-24`} value={values.context.jobDescription} maxLength={20000} onChange={(e) => setContext({ jobDescription: e.target.value })} />
        </Field>
        <Field label="職務経歴の要約">
          <textarea className={`${inputClass} min-h-24`} value={values.context.careerSummary} maxLength={20000} onChange={(e) => setContext({ careerSummary: e.target.value })} />
        </Field>
        <Field label="転職理由のメモ">
          <textarea className={`${inputClass} min-h-16`} value={values.context.reasonForChange} maxLength={5000} onChange={(e) => setContext({ reasonForChange: e.target.value })} />
        </Field>
      </section>

      {children}

      <button type="submit" className="self-start rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground hover:opacity-90">
        準備する(マイクの許可と質問の準備)
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
