"use client";

import { OCCUPATION_GROUPS } from "@/features/app/occupations";
import { updateAppData, useAppData, type AppData } from "@/features/app/store";
import { Card, PageHeader, SecondaryLink, TextArea, TextInput } from "./ui";

/** 職種・経歴(要件 S-03、F-02)。入力はその場で保存し、画面を離れても失わない(UX-03) */
export function ProfileScreen() {
  const data = useAppData();
  if (!data) return null;
  const profile = data.profile;
  const set = (patch: Partial<AppData["profile"]>) => updateAppData((d) => ({ ...d, profile: { ...d.profile, ...patch } }));

  return (
    <>
      <PageHeader title="職種・経歴" lead="書いた内容に合わせて、面接官が質問します。メモ程度で大丈夫です。入力した内容は自動で保存されます。" />
      <Card>
        <label className="flex flex-col gap-2">
          <span className="font-bold">職種</span>
          <select
            value={profile.occupation ?? ""}
            onChange={(e) => set({ occupation: e.target.value || null })}
            className="min-h-12 rounded-xl border border-border bg-background px-4 text-base"
          >
            <option value="">選んでください</option>
            {OCCUPATION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {profile.occupation === "other" && (
          <TextInput label="職種名" value={profile.occupationOther} onChange={(occupationOther) => set({ occupationOther })} placeholder="例:病院の総務" maxLength={40} />
        )}
      </Card>
      <Card>
        <TextArea
          label="これまでの経歴"
          hint="働いた場所・期間、担当した仕事、工夫したことや成果など"
          value={profile.careerSummary}
          onChange={(careerSummary) => set({ careerSummary })}
          placeholder="例:総合病院の内科病棟で看護師として8年勤務。受け持ち患者の看護と退院支援を担当。3年目から新人看護師の指導役を務めた。"
          maxLength={20000}
          rows={7}
        />
        <TextArea
          label="転職を考えた理由"
          hint="正直な理由で大丈夫です。面接での伝え方は、練習のあとの結果でアドバイスします"
          value={profile.reasonForChange}
          onChange={(reasonForChange) => set({ reasonForChange })}
          placeholder="例:急性期の看護を学び、将来は認定看護師を目指したい。"
          maxLength={5000}
        />
      </Card>
      <SecondaryLink href="/">ホームに戻る</SecondaryLink>
    </>
  );
}
