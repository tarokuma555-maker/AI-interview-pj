"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONSENT_POINTS } from "@/features/app/consent";
import { FIRST_CHOICE } from "@/features/app/interview-setup";
import { OCCUPATION_GROUPS } from "@/features/app/occupations";
import { CONSENT_VERSION, updateAppData, useAppData } from "@/features/app/store";
import { Card, PageHeader, PrimaryButton, SecondaryButton, TextInput } from "./ui";

const STEPS = ["同意", "職種", "使い方"] as const;

/** はじめての案内(要件 S-16、F-13)。同意 → 職種 → 使い方 → はじめての面接 */
export function WelcomeScreen() {
  const data = useAppData();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [occupation, setOccupation] = useState<string | null>(data?.profile.occupation ?? null);
  const [other, setOther] = useState(data?.profile.occupationOther ?? "");

  function agree() {
    updateAppData((d) => ({ ...d, consent: { at: new Date().toISOString(), version: CONSENT_VERSION } }));
    setStep(1);
  }

  function saveOccupation() {
    updateAppData((d) => ({ ...d, profile: { ...d.profile, occupation, occupationOther: occupation === "other" ? other.trim() : "" } }));
    setStep(2);
  }

  function finish(startInterview: boolean) {
    updateAppData((d) => ({ ...d, onboardedAt: d.onboardedAt ?? new Date().toISOString(), lastChoice: d.lastChoice ?? FIRST_CHOICE }));
    router.replace(startInterview ? "/interview" : "/");
  }

  return (
    <>
      <ol className="flex gap-2 text-sm" aria-label="はじめての案内の進み具合">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`flex-1 rounded-full py-1 text-center ${i <= step ? "bg-accent text-accent-foreground" : "bg-border text-muted"}`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <>
          <PageHeader title="ようこそ" lead="AIの面接官と声で話して、本番の面接を練習できます。はじめる前に、次の内容をご確認ください。" />
          <Card>
            <ul className="flex list-disc flex-col gap-2 pl-5 leading-relaxed">
              {CONSENT_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-background px-4 font-semibold">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-5 accent-[var(--accent)]" />
              上の内容に同意します
            </label>
          </Card>
          <PrimaryButton onClick={agree} disabled={!agreed}>
            同意して進む
          </PrimaryButton>
        </>
      )}

      {step === 1 && (
        <>
          <PageHeader title="お仕事を選んでください" lead="職種に合わせた質問で練習できます。あとから変えられます。" />
          {OCCUPATION_GROUPS.map((group) => (
            <fieldset key={group.label} className="flex flex-col gap-2">
              <legend className="mb-2 font-bold">{group.label}</legend>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => {
                  const checked = occupation === item.id;
                  return (
                    <label
                      key={item.id}
                      className={`flex min-h-12 cursor-pointer items-center rounded-xl border-2 px-3 py-2 font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                        checked ? "border-accent bg-accent-soft" : "border-border bg-surface"
                      }`}
                    >
                      <input type="radio" name="occupation" className="sr-only" checked={checked} onChange={() => setOccupation(item.id)} />
                      {item.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {occupation === "other" && <TextInput label="職種名" value={other} onChange={setOther} placeholder="例:病院の総務" maxLength={40} />}
          <PrimaryButton onClick={saveOccupation} disabled={!occupation || (occupation === "other" && !other.trim())}>
            次へ
          </PrimaryButton>
        </>
      )}

      {step === 2 && (
        <>
          <PageHeader title="面接の進み方" lead="Web面接と同じように、画面の面接官と声で話します。" />
          <ol className="flex flex-col gap-3">
            <GuideCard number={1} title="面接官が質問します">
              面接官の声が流れます。周りに声が漏れないよう、<strong>イヤホン</strong>をおすすめします。
            </GuideCard>
            <GuideCard number={2} title="声で答えます">
              話し終えたら、最後に<strong>「以上です」</strong>と言ってください。途中で考えて黙っても大丈夫です。
            </GuideCard>
            <GuideCard number={3} title="結果が分かります">
              面接が終わると、良かった点と、次に直すとよい点が分かります。
            </GuideCard>
          </ol>
          <PrimaryButton onClick={() => finish(true)}>はじめての面接へ(約5分)</PrimaryButton>
          <SecondaryButton onClick={() => finish(false)}>あとで練習する</SecondaryButton>
        </>
      )}
    </>
  );
}

function GuideCard({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-border bg-surface p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground" aria-hidden>
        {number}
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold">{title}</p>
        <p className="leading-relaxed">{children}</p>
      </div>
    </li>
  );
}
