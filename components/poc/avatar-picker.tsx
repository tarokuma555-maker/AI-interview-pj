"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarInputs } from "@/features/avatar/behavior";
import { textToMorae, type VoiceState } from "@/features/avatar/lip-sync";
import {
  FACE_POINT_LABELS,
  FACE_POINT_ORDER,
  manifestFromPoints,
  validateFacePoints,
  type FacePoints,
  type Point,
} from "@/features/avatar/manifest";
import { BUILTINS, isBuiltin, resolveAvatar, type AvatarSettings } from "@/features/avatar/settings";
import { AvatarView, isWideAvatar } from "./avatar-view";
import { ExpressionSlots } from "./expression-slots";

const DEMO_TEXT = "本日はよろしくお願いいたします。それでは、まず自己紹介をお願いできますか。";
const DEMO_MS = textToMorae(DEMO_TEXT).reduce((sum, mora) => sum + mora.ms, 0);
const MAX_IMAGE_SIZE = 1024;
const OPTIONS: { value: AvatarSettings["selected"]; label: string }[] = [
  { value: "sato", label: "佐藤 健一(写真)" },
  { value: "placeholder", label: "仮の顔(イラスト)" },
  { value: "custom", label: "自分で用意した画像" },
  { value: "none", label: "表示しない" },
];

type Draft = { src: string; width: number; height: number; points: Point[] };

export function AvatarPicker({
  value,
  onChange,
  saveFailed,
}: {
  value: AvatarSettings;
  onChange: (next: AvatarSettings) => void;
  saveFailed: boolean;
}) {
  const [wantsCustom, setWantsCustom] = useState(value.selected === "custom");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const demo = useRef<VoiceState>({ kind: "none" });
  const demoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(demoTimer.current), []);

  const getInputs = useCallback(
    (): AvatarInputs => ({ mode: demo.current.kind === "none" ? "idle" : "speaking", voice: demo.current, candidateVoice: false }),
    [],
  );

  function playDemo() {
    demo.current = { kind: "speech", text: DEMO_TEXT, startedAt: performance.now() };
    clearTimeout(demoTimer.current);
    demoTimer.current = setTimeout(() => {
      demo.current = { kind: "none" };
    }, DEMO_MS);
  }

  function select(selected: AvatarSettings["selected"]) {
    setError(null);
    setDraft(null);
    setWantsCustom(selected === "custom");
    if (selected !== "custom" || value.custom) onChange({ ...value, selected });
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイル(JPEG・PNG・WebP)を選んでください");
      return;
    }
    try {
      setDraft({ ...(await readImage(file)), points: [] });
    } catch {
      setError("画像を読み込めませんでした。別の画像でお試しください");
    }
  }

  function addPoint(event: React.MouseEvent<HTMLDivElement>) {
    if (!draft) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * draft.width,
      y: ((event.clientY - rect.top) / rect.height) * draft.height,
    };
    const points = [...draft.points, point];
    if (points.length < FACE_POINT_ORDER.length) {
      setDraft({ ...draft, points });
      return;
    }
    const facePoints = Object.fromEntries(FACE_POINT_ORDER.map((key, i) => [key, points[i]])) as FacePoints;
    const problem = validateFacePoints(facePoints);
    if (problem) {
      setError(problem);
      setDraft({ ...draft, points: [] });
      return;
    }
    const manifest = manifestFromPoints(facePoints, draft, `custom-${Date.now()}`);
    setDraft(null);
    setError(null);
    onChange({ ...value, selected: "custom", custom: manifest });
  }

  const preview = wantsCustom ? value.custom : resolveAvatar(value);
  // 表情の画像を追加できる顔(自分で用意した画像と、表情の画像を持たない用意済みの顔)
  const builtinId = !wantsCustom && isBuiltin(value.selected) && !BUILTINS[value.selected].expressions ? value.selected : null;
  const nextPoint = draft ? FACE_POINT_ORDER[draft.points.length] : null;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-bold">面接官のアバター</h2>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" role="radiogroup" aria-label="面接官のアバター">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex items-center gap-2">
            <input
              type="radio"
              name="avatar"
              checked={option.value === "custom" ? wantsCustom : !wantsCustom && value.selected === option.value}
              onChange={() => select(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>

      {wantsCustom && !draft && !value.custom && (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-muted">
            正面を向き、目を開けて口を閉じた、肩まで写った顔の画像を選んでください(正方形がおすすめ)。画像はこのブラウザの中だけで使い、サーバーには送りません。
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
            aria-label="アバターの画像を選ぶ"
          />
        </div>
      )}

      {draft && nextPoint && (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <span className="font-semibold">
              {draft.points.length + 1} / {FACE_POINT_ORDER.length}:
            </span>
            画像の「{FACE_POINT_LABELS[nextPoint]}」をクリックしてください。
          </p>
          <div className="relative max-w-md cursor-crosshair select-none" onClick={addPoint}>
            <Image src={draft.src} width={draft.width} height={draft.height} unoptimized alt="選んだ画像" className="h-auto w-full rounded-lg" draggable={false} />
            {draft.points.map((point, i) => (
              <span
                key={i}
                className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent"
                style={{ left: `${(point.x / draft.width) * 100}%`, top: `${(point.y / draft.height) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setDraft({ ...draft, points: [] })} className="rounded-lg border border-border px-3 py-2">
              最初からやり直す
            </button>
            <button type="button" onClick={() => setDraft(null)} className="rounded-lg border border-border px-3 py-2">
              やめる
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {preview && !draft && (
        <div className="flex flex-wrap items-end gap-4">
          <div className={`overflow-hidden rounded-xl border border-border ${isWideAvatar(preview) ? "w-full max-w-md" : "w-48"}`}>
            <AvatarView manifest={preview} getInputs={getInputs} />
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <button type="button" onClick={playDemo} className="rounded-lg border border-border px-3 py-2">
              口の動きを試す
            </button>
            {wantsCustom && (
              <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-border px-3 py-2">
                <span>画像を選び直す</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void onFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </div>
      )}

      {wantsCustom && value.custom && !draft && (
        <ExpressionSlots key={value.custom.id} manifest={value.custom} onChange={(custom) => onChange({ ...value, selected: "custom", custom })} />
      )}
      {builtinId && preview && (
        <ExpressionSlots
          key={builtinId}
          manifest={preview}
          onChange={(next) => onChange({ ...value, builtinExpressions: { ...value.builtinExpressions, [builtinId]: next.expressions } })}
        />
      )}

      {saveFailed && value.selected === "custom" && (
        <p className="text-sm text-muted">画像が大きいためこのブラウザに保存できませんでした。この画面を閉じると選び直しが必要です。</p>
      )}
    </section>
  );
}

/** 画像を読み込み、長い辺が MAX_IMAGE_SIZE 以下の JPEG にする */
async function readImage(file: File): Promise<{ src: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_IMAGE_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { src: canvas.toDataURL("image/jpeg", 0.9), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
