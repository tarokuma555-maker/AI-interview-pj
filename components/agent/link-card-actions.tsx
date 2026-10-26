"use client";
import { useState, useTransition } from "react";
import { toggleLink } from "@/app/agent/(signed-in)/seekers/actions";
import { Notice, SecondaryButton, SecondaryLink } from "@/components/app/ui";
export function LinkCardActions({ seekerId, linkId, disabled }: { seekerId: string; linkId: string; disabled: boolean }) {
  const [pending, start] = useTransition(), [message, setMessage] = useState("");
  return <><SecondaryLink href={`/agent/seekers/${seekerId}/links/${linkId}/edit`}>直す</SecondaryLink>
    <SecondaryButton disabled={pending} onClick={() => { setMessage(""); start(async () => { const r = await toggleLink(seekerId, linkId, !disabled); if (!r.ok) setMessage(r.message); }); }}>{pending ? "変更しています…" : disabled ? "使えるようにする" : "使えないようにする"}</SecondaryButton>
    {message && <Notice tone="danger">{message}</Notice>}
  </>;
}
