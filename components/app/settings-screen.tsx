"use client";

import Link from "next/link";
import { useState } from "react";
import { clearAllData, updateAppData, useAppData, type AppData } from "@/features/app/store";
import { Card, ChoiceGroup, PageHeader, SecondaryButton, SecondaryLink } from "./ui";

/** 設定(要件 S-12)。面接官の話す速さ・字幕の初期値・データの削除 */
export function SettingsScreen() {
  const data = useAppData();
  const [confirming, setConfirming] = useState(false);
  if (!data) return null;
  const prefs = data.preferences;
  const set = (patch: Partial<AppData["preferences"]>) => updateAppData((d) => ({ ...d, preferences: { ...d.preferences, ...patch } }));

  return (
    <>
      <PageHeader title="設定" />
      <Card>
        <ChoiceGroup
          legend="面接官の話す速さ"
          value={prefs.speechRate}
          onChange={(speechRate) => set({ speechRate })}
          options={[
            { value: "normal", label: "ふつう" },
            { value: "slow", label: "ゆっくり" },
          ]}
          columns={2}
        />
        <ChoiceGroup
          legend="面接中の字幕(面接官の言葉を文字で出す)"
          value={prefs.captions ? "on" : "off"}
          onChange={(value) => set({ captions: value === "on" })}
          options={[
            { value: "off", label: "出さない", hint: "本番に近い" },
            { value: "on", label: "出す", hint: "聞き取りにくいとき" },
          ]}
          columns={2}
        />
      </Card>

      <Card>
        <h2 className="font-bold">データの扱い</h2>
        <p className="leading-relaxed">
          練習の内容と結果は、このブラウザの中にだけ保存されています。くわしくは
          <Link href="/help#data" className="font-semibold text-accent underline underline-offset-4">
            データの扱い
          </Link>
          をご覧ください。
        </p>
        {confirming ? (
          <div className="flex flex-col gap-3" role="alertdialog" aria-label="データを削除しますか">
            <p className="font-bold">練習の記録・経歴・応募先をすべて削除しますか?元に戻せません。</p>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton onClick={() => setConfirming(false)}>やめる</SecondaryButton>
              <SecondaryButton onClick={clearAllData} className="border-danger text-danger">
                削除する
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <SecondaryButton onClick={() => setConfirming(true)}>このブラウザのデータを削除</SecondaryButton>
        )}
      </Card>
      <SecondaryLink href="/">ホームに戻る</SecondaryLink>
    </>
  );
}
