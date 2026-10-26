"use client";
import { useState, useTransition } from "react";
import { removeSeeker } from "@/app/agent/(signed-in)/seekers/actions";
import { Notice, SecondaryButton } from "@/components/app/ui";
/** 求職者と記録の削除は確認してから行う(設計 2026-10-27 4.1)。 */
export function DeleteSeeker({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false), [message, setMessage] = useState(""); const [pending, start] = useTransition();
  return <div className="flex flex-col gap-3">
    {!confirm ? <SecondaryButton onClick={() => setConfirm(true)}>この求職者を削除</SecondaryButton> : <>
      <Notice tone="danger">{name}さんと、応募先・招待リンク・練習の記録をすべて削除します。元に戻せません。</Notice>
      <SecondaryButton disabled={pending} onClick={() => start(async () => { const r = await removeSeeker(id); if (r) setMessage(r.message); })}>{pending ? "削除しています…" : "削除する"}</SecondaryButton>
      <SecondaryButton disabled={pending} onClick={() => setConfirm(false)}>やめる</SecondaryButton>
    </>}{message && <Notice tone="danger">{message}</Notice>}
  </div>;
}
