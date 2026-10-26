"use client";
import { useState, useTransition } from "react";
import { saveSeeker } from "@/app/agent/(signed-in)/seekers/actions";
import { Notice, PrimaryButton, SecondaryLink, TextArea, TextInput } from "@/components/app/ui";
import type { Seeker } from "@/lib/agent-data/types";
/** 求職者の登録・編集(設計 2026-10-27 4.1)。 */
export function SeekerForm({ seeker }: { seeker?: Seeker }) {
  const [name, setName] = useState(seeker?.name ?? ""), [occupation, setOccupation] = useState(seeker?.occupation ?? "");
  const [careerSummary, setCareer] = useState(seeker?.careerSummary ?? ""), [reasonForChange, setReason] = useState(seeker?.reasonForChange ?? "");
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  return <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (pending) return; setMessage(""); start(async () => { const r = await saveSeeker(seeker?.id ?? null, { name, occupation, careerSummary, reasonForChange }); if (r) setMessage(r.message); }); }}>
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
      <TextInput label="名前" value={name} onChange={setName} maxLength={100} />
      <TextInput label="職種" value={occupation} onChange={setOccupation} maxLength={100} />
      <TextArea label="経歴" value={careerSummary} onChange={setCareer} maxLength={20000} />
      <TextArea label="転職理由" value={reasonForChange} onChange={setReason} maxLength={5000} />
      {message && <Notice tone="danger">{message}</Notice>}
      <PrimaryButton type="submit" disabled={pending}>{pending ? "保存しています…" : "保存する"}</PrimaryButton>
    </fieldset>
    <SecondaryLink href={seeker ? `/agent/seekers/${seeker.id}` : "/agent"}>戻る</SecondaryLink>
  </form>;
}
