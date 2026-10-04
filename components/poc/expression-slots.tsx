"use client";

import Image from "next/image";
import { useState } from "react";
import { ExpressionImageError, prepareExpression, type ExpressionKind } from "@/features/avatar/expressions";
import type { AvatarManifest, ExpressionImage } from "@/features/avatar/manifest";

const SLOTS: { kind: ExpressionKind; label: string; instruction: string }[] = [
  { kind: "a", label: "「あ」の口", instruction: "口を大きく開けて「あ」と発音している" },
  { kind: "i", label: "「い」の口", instruction: "口を横に引いて「い」と発音している" },
  { kind: "u", label: "「う」の口", instruction: "口をすぼめて「う」と発音している" },
  { kind: "e", label: "「え」の口", instruction: "口を少し開けて「え」と発音している" },
  { kind: "o", label: "「お」の口", instruction: "口を丸く開けて「お」と発音している" },
  { kind: "blink", label: "目を閉じた顔", instruction: "目を自然に閉じている" },
];

type SlotState = { busy?: boolean; error?: string };

/** 自分で用意した画像に、同じ人物の表情違いの画像を追加する(設計書 3.12) */
export function ExpressionSlots({ manifest, onChange }: { manifest: AvatarManifest; onChange: (next: AvatarManifest) => void }) {
  const [slots, setSlots] = useState<Partial<Record<ExpressionKind, SlotState>>>({});

  const current = (kind: ExpressionKind): ExpressionImage | undefined =>
    kind === "blink" ? manifest.expressions?.blink : manifest.expressions?.mouth?.[kind];

  function withExpression(kind: ExpressionKind, image: ExpressionImage | undefined): AvatarManifest {
    const expressions = manifest.expressions ?? {};
    if (kind === "blink") return { ...manifest, expressions: { ...expressions, blink: image } };
    return { ...manifest, expressions: { ...expressions, mouth: { ...expressions.mouth, [kind]: image } } };
  }

  async function add(kind: ExpressionKind, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSlots((s) => ({ ...s, [kind]: { error: "画像ファイル(JPEG・PNG・WebP)を選んでください" } }));
      return;
    }
    setSlots((s) => ({ ...s, [kind]: { busy: true } }));
    try {
      const image = await prepareExpression(manifest, kind, file);
      setSlots((s) => ({ ...s, [kind]: {} }));
      onChange(withExpression(kind, image));
    } catch (error) {
      const message = error instanceof ExpressionImageError ? error.message : "画像を読み込めませんでした。別の画像でお試しください";
      setSlots((s) => ({ ...s, [kind]: { error: message } }));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">表情の画像(追加すると、より自然に動きます)</h3>
        <p className="text-muted">
          同じ人物・同じ構図のまま、口の形や目だけを変えた画像を追加します。位置は自動で合わせます。まず「あ」の口を追加すると、口の中が本物の画像になります。
        </p>
      </div>
      <details className="rounded-lg bg-background p-3">
        <summary className="cursor-pointer">画像生成AIへの頼み方</summary>
        <p className="mt-2">元の画像を添付して、次のように頼みます(「」の中を表情ごとに変えます)。</p>
        <p className="mt-2 rounded bg-surface p-2">
          この画像と同じ人物・同じ服装・同じ背景・同じ構図・同じ大きさのまま、表情だけを「口を大きく開けて『あ』と発音している」顔に変えてください。顔の向きと位置は変えないでください。
        </p>
        <ul className="mt-2 list-disc pl-5 text-muted">
          {SLOTS.map((slot) => (
            <li key={slot.kind}>
              {slot.label}:「{slot.instruction}」
            </li>
          ))}
        </ul>
      </details>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((slot) => {
          const image = current(slot.kind);
          const state = slots[slot.kind] ?? {};
          return (
            <li key={slot.kind} className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background">
                {image ? (
                  <Image src={image.src} alt={`${slot.label}の画像`} width={56} height={56} unoptimized className="size-14 object-contain" />
                ) : (
                  <span className="text-xs text-muted">未設定</span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold">{slot.label}</span>
                {state.busy ? (
                  <span className="text-muted">位置を合わせています…</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <label className="cursor-pointer rounded border border-border px-2 py-1">
                      {image ? "差し替える" : "画像を選ぶ"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        aria-label={`${slot.label}の画像を選ぶ`}
                        onChange={(e) => {
                          void add(slot.kind, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {image && (
                      <button type="button" className="rounded border border-border px-2 py-1" onClick={() => onChange(withExpression(slot.kind, undefined))}>
                        削除
                      </button>
                    )}
                  </div>
                )}
                {state.error && <span className="text-danger">{state.error}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
