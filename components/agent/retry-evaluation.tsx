"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { retryEvaluation } from "@/app/agent/(signed-in)/seekers/actions";
import { Notice, PrimaryButton, SecondaryButton } from "@/components/app/ui";

/** 結果をまとめられなかった・止まった練習の結果を作り直す(段階D) */
export function RetryEvaluation({ seekerId, linkId, sessionId }: { seekerId: string; linkId: string; sessionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  if (state?.ok) return <><Notice tone="success">{state.message}</Notice><SecondaryButton onClick={() => router.refresh()}>開き直す</SecondaryButton></>;
  return <>
    {state && <Notice tone="danger">{state.message}</Notice>}
    <PrimaryButton disabled={pending} onClick={() => start(async () => {
      const r = await retryEvaluation(seekerId, linkId, sessionId);
      setState(r.ok ? { ok: true, message: "結果をまとめています。1分ほどしてから、この画面を開き直してください。" } : r);
    })}>{pending ? "受け付けています…" : "結果を作り直す"}</PrimaryButton>
  </>;
}
