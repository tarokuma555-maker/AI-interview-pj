"use client";

import Link from "next/link";
import { useState } from "react";
import { DURATION_CHOICES, STAGE_CHOICES, STYLE_CHOICES } from "@/features/app/interview-setup";
import { occupationLabel } from "@/features/app/occupations";
import type { AppData, InterviewChoice } from "@/features/app/store";
import { Card, ChoiceGroup, PageHeader, PrimaryButton, SecondaryButton } from "../ui";

/**
 * 面接の準備(要件 S-05)。前回の設定を見せて「このまま始める」を主なボタンにし、
 * 変える場合も同じ画面で選択式で変える(要件 F-04-10、UX-03)。
 */
export function PrepareStep({
  data,
  initial,
  ready,
  onStart,
}: {
  data: AppData;
  initial: InterviewChoice;
  /** サーバーの設定を読み終えたか */
  ready: boolean;
  onStart: (choice: InterviewChoice) => void;
}) {
  const [choice, setChoice] = useState(initial);
  const [editing, setEditing] = useState(false);
  const set = (patch: Partial<InterviewChoice>) => setChoice((c) => ({ ...c, ...patch }));

  const company = data.companies.find((c) => c.id === choice.companyId);
  const target = company ? `${company.name}${company.position ? `(${company.position})` : ""}` : `応募先の指定なし(${occupationLabel(data.profile.occupation, data.profile.occupationOther)})`;
  const stage = STAGE_CHOICES.find((s) => s.value === choice.stage)!;
  const style = STYLE_CHOICES.find((s) => s.value === choice.style)!;
  const duration = DURATION_CHOICES.find((d) => d.value === choice.durationMin)!;

  return (
    <>
      <PageHeader title="面接の準備" lead={editing ? "練習したい面接を選んでください。" : "この内容で練習します。"} />

      {!editing && (
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3">
            <Row label="応募先" value={target} />
            <Row label="面接" value={`${stage.label}(${stage.hint})`} />
            <Row label="面接官" value={style.label} />
            <Row label="時間" value={duration.label} />
            <Row label="答え方" value={choice.answerBy === "voice" ? "声で答える" : "文字で答える"} />
          </dl>
          <button type="button" onClick={() => setEditing(true)} className="self-start font-semibold text-accent underline underline-offset-4">
            内容を変える
          </button>
        </Card>
      )}

      {editing && (
        <div className="flex flex-col gap-6">
          <ChoiceGroup
            legend="応募先"
            value={choice.companyId ?? ""}
            onChange={(value) => set({ companyId: value || null })}
            options={[
              { value: "", label: "指定しない", hint: `${occupationLabel(data.profile.occupation, data.profile.occupationOther)}の一般的な面接` },
              ...data.companies.map((c) => ({ value: c.id, label: c.name || "(名前なし)", hint: c.position || undefined })),
            ]}
          />
          <Link href="/companies" className="-mt-4 self-start font-semibold text-accent underline underline-offset-4">
            応募先を登録する
          </Link>
          <ChoiceGroup legend="面接の段階" value={choice.stage} onChange={(stage) => set({ stage })} options={STAGE_CHOICES} />
          <ChoiceGroup legend="面接官の雰囲気" value={choice.style} onChange={(style) => set({ style })} options={STYLE_CHOICES} columns={3} />
          <ChoiceGroup legend="時間" value={choice.durationMin} onChange={(durationMin) => set({ durationMin })} options={DURATION_CHOICES} columns={3} />
          <ChoiceGroup
            legend="答え方"
            value={choice.answerBy}
            onChange={(answerBy) => set({ answerBy })}
            options={[
              { value: "voice", label: "声で答える", hint: "本番と同じように話して答えます" },
              { value: "text", label: "文字で答える", hint: "声を出せない場所で練習するとき" },
            ]}
            columns={2}
          />
        </div>
      )}

      <PrimaryButton onClick={() => onStart(choice)} disabled={!ready}>
        {ready ? (editing ? "この内容で始める" : "このまま始める") : "準備しています…"}
      </PrimaryButton>
      {editing && (
        <SecondaryButton
          onClick={() => {
            setChoice(initial);
            setEditing(false);
          }}
        >
          変更をやめる
        </SecondaryButton>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </>
  );
}
