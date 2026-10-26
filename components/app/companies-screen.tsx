"use client";

import { useState } from "react";
import { newId, updateAppData, useAppData, type CompanyDraft } from "@/features/app/store";
import { Card, PageHeader, PrimaryButton, SecondaryButton, SecondaryLink, TextArea, TextInput } from "./ui";

const NEW_DRAFT: CompanyDraft = { id: null, name: "", position: "", jobDescription: "" };

/**
 * 応募先(要件 S-04、F-03-1)。求人票の文章を貼り付けると、それに合わせて質問する。
 * 入力中の内容はブラウザに残し、画面を離れて戻っても続きから入力できるようにする(設計書 14.2)。
 */
export function CompaniesScreen() {
  const data = useAppData();
  const [deleting, setDeleting] = useState<string | null>(null);
  if (!data) return null;
  const editing = data.companyDraft;

  function setEditing(draft: CompanyDraft | null) {
    updateAppData((d) => ({ ...d, companyDraft: draft }));
  }

  function save() {
    if (!editing || !editing.name.trim()) return;
    const now = new Date().toISOString();
    const fields = { name: editing.name.trim(), position: editing.position.trim(), jobDescription: editing.jobDescription };
    updateAppData((d) => ({
      ...d,
      // 直している間に応募先が消されていたら、新しく追加する
      companies: d.companies.some((c) => c.id === editing.id)
        ? d.companies.map((c) => (c.id === editing.id ? { ...c, ...fields, updatedAt: now } : c))
        : [...d.companies, { id: newId(), ...fields, updatedAt: now }],
      companyDraft: null,
    }));
  }

  function remove(id: string) {
    updateAppData((d) => ({
      ...d,
      companies: d.companies.filter((c) => c.id !== id),
      lastChoice: d.lastChoice?.companyId === id ? { ...d.lastChoice, companyId: null } : d.lastChoice,
    }));
    setDeleting(null);
  }

  if (editing) {
    const set = (patch: Partial<CompanyDraft>) => setEditing({ ...editing, ...patch });
    return (
      <>
        <PageHeader title={editing.id ? "応募先を直す" : "応募先を追加"} lead="求人票の内容を貼り付けると、それに合わせた質問で練習できます。" />
        <Card>
          <TextInput label="病院・施設・会社の名前" value={editing.name} onChange={(name) => set({ name })} placeholder="例:〇〇総合病院" maxLength={200} />
          <TextInput label="職種・配属先" value={editing.position} onChange={(position) => set({ position })} placeholder="例:看護師(内科病棟)" maxLength={200} />
          <TextArea
            label="求人票の内容"
            hint="仕事内容・求める人物像・勤務形態など。求人サイトの文章をそのまま貼り付けて大丈夫です"
            value={editing.jobDescription}
            onChange={(jobDescription) => set({ jobDescription })}
            maxLength={20000}
            rows={8}
          />
        </Card>
        <PrimaryButton onClick={save} disabled={!editing.name.trim()}>
          保存する
        </PrimaryButton>
        <SecondaryButton onClick={() => setEditing(null)}>やめる</SecondaryButton>
      </>
    );
  }

  return (
    <>
      <PageHeader title="応募先" lead="応募先を登録すると、面接の準備で選べます。" />
      {data.companies.length === 0 && <p className="text-muted">まだ登録されていません。</p>}
      <ul className="flex flex-col gap-3">
        {data.companies.map((company) => (
          <li key={company.id}>
            <Card>
              <div>
                <p className="text-lg font-bold">{company.name}</p>
                {company.position && <p className="text-muted">{company.position}</p>}
              </div>
              {deleting === company.id ? (
                <div className="flex flex-col gap-2">
                  <p className="font-semibold">この応募先を削除しますか?(練習の記録は残ります)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <SecondaryButton onClick={() => setDeleting(null)}>やめる</SecondaryButton>
                    <SecondaryButton onClick={() => remove(company.id)} className="border-danger text-danger">
                      削除する
                    </SecondaryButton>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <SecondaryButton onClick={() => setEditing({ id: company.id, name: company.name, position: company.position, jobDescription: company.jobDescription })}>直す</SecondaryButton>
                  <SecondaryButton onClick={() => setDeleting(company.id)}>削除</SecondaryButton>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
      <PrimaryButton onClick={() => setEditing(NEW_DRAFT)}>応募先を追加</PrimaryButton>
      <SecondaryLink href="/">ホームに戻る</SecondaryLink>
    </>
  );
}
