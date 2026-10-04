"use client";

import { useEffect, useRef, useState } from "react";
import { AvatarBehavior, type AvatarInputs } from "@/features/avatar/behavior";
import { LipSync } from "@/features/avatar/lip-sync";
import { viewRect, type AvatarManifest } from "@/features/avatar/manifest";
import { MouthImageMixer } from "@/features/avatar/mouth-images";
import { createAvatarSurface, type AvatarSurface } from "@/features/avatar/renderer";
import { reducePose } from "@/features/avatar/rig";

type LoadState = "loading" | "animated" | "static" | "error";

/** 横長の画像は、Web面接の画面のように横長の枠で表示する */
export function isWideAvatar(manifest: AvatarManifest): boolean {
  const view = viewRect(manifest);
  return view.width / view.height > 1.2;
}

/** 面接官のアバターを描く。getInputs は描画のたびに呼ばれる */
export function AvatarView({ manifest, getInputs }: { manifest: AvatarManifest; getInputs: () => AvatarInputs }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputsRef = useRef(getInputs);
  const [state, setState] = useState<LoadState>("loading");

  useEffect(() => {
    inputsRef.current = getInputs;
  }, [getInputs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let surface: AvatarSurface | null = null;
    let mixer = new MouthImageMixer([]);
    let frame = 0;
    let disposed = false;
    const lipSync = new LipSync();
    const behavior = new AvatarBehavior();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.round(canvas.clientWidth * scale);
      const height = Math.round(canvas.clientHeight * scale);
      if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let last = performance.now();
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      const inputs = inputsRef.current();
      const mouth = lipSync.update(inputs.voice, now, dt);
      const pose = behavior.update(now, { mode: inputs.mode, mouth, candidateVoice: inputs.candidateVoice });
      pose.mouthImages = mixer.update(mouth, dt);
      surface?.render(reducedMotion.matches ? reducePose(pose, 0.3) : pose);
    };

    createAvatarSurface(canvas, manifest)
      .then((created) => {
        if (disposed) {
          created.dispose();
          return;
        }
        surface = created;
        mixer = new MouthImageMixer(created.mouthImageKeys);
        setState(created.animated ? "animated" : "static");
        draw();
      })
      .catch(() => {
        if (!disposed) setState("error");
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      surface?.dispose();
    };
  }, [manifest]);

  const view = viewRect(manifest);
  return (
    <div className="relative w-full" style={{ aspectRatio: `${view.width} / ${view.height}` }}>
      <canvas
        ref={canvasRef}
        className={`h-full w-full transition-opacity duration-300 ${state === "animated" || state === "static" ? "opacity-100" : "opacity-0"}`}
        role="img"
        aria-label={`面接官のアバター(${manifest.name})`}
      />
      {state !== "animated" && state !== "static" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          {state === "loading" ? "アバターを準備しています…" : "アバターを表示できませんでした"}
        </div>
      )}
      {state === "static" && (
        <p className="absolute inset-x-0 bottom-0 bg-surface/80 px-2 py-1 text-center text-xs text-muted">
          この端末では口の動きを表示できません
        </p>
      )}
    </div>
  );
}
