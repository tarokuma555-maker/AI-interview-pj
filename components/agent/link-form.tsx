"use client";
import { useState, useTransition } from "react";
import { saveLink } from "@/app/agent/(signed-in)/seekers/actions";
import { ChoiceGroup, Notice, PrimaryButton, SecondaryLink, TextArea, TextInput } from "@/components/app/ui";
import { DURATION_CHOICES, STAGE_CHOICES, STYLE_CHOICES } from "@/features/app/interview-setup";
import type { LinkInput } from "@/lib/agent-data/schemas";
import type { PracticeLink } from "@/lib/agent-data/types";
/** 応募先と面接設定(設計 2026-10-27 4.1)。 */
export function LinkForm({ seekerId, link }: { seekerId: string; link?: PracticeLink }) {
  const [input, setInput] = useState<LinkInput>(link ?? { companyName: "", position: "", jobDescription: "", stage: "second", style: "standard", durationMin: 15 });
  const update = <K extends keyof LinkInput>(key: K, value: LinkInput[K]) => setInput(s => ({ ...s, [key]: value }));
  const [message, setMessage] = useState(""); const [pending, start] = useTransition();
  return <form className="flex flex-col gap-5" onSubmit={e => { e.preventDefault(); if (pending) return; setMessage(""); start(async () => { const r = await saveLink(seekerId, link?.id ?? null, input); if (r) setMessage(r.message); }); }}>
    {link && <Notice>直しても、リンクは変わりません。次の練習から新しい内容を使います。</Notice>}
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
      <TextInput label="病院・会社の名前" value={input.companyName} onChange={v => update("companyName", v)} maxLength={200} />
      <TextInput label="職種・配属先" value={input.position} onChange={v => update("position", v)} maxLength={200} />
      <TextArea label="求人票の内容" hint="仕事内容・求める人物像など。求人サイトの文章をそのまま貼り付けて大丈夫です" value={input.jobDescription} onChange={v => update("jobDescription", v)} maxLength={20000} />
      <ChoiceGroup legend="選考段階" options={STAGE_CHOICES} value={input.stage} onChange={v => update("stage", v)} />
      <ChoiceGroup legend="面接官の雰囲気" options={STYLE_CHOICES} value={input.style} onChange={v => update("style", v)} />
      <ChoiceGroup legend="時間" options={DURATION_CHOICES} value={input.durationMin} onChange={v => update("durationMin", v)} />
      {message && <Notice tone="danger">{message}</Notice>}
      <PrimaryButton type="submit" disabled={pending}>{pending ? "保存しています…" : link ? "保存する" : "招待リンクを作る"}</PrimaryButton>
    </fieldset>
    <SecondaryLink href={`/agent/seekers/${seekerId}`}>戻る</SecondaryLink>
  </form>;
}
