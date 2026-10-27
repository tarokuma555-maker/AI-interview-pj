"use client";
import { Notice, PageHeader, PrimaryButton } from "@/components/app/ui";

/** 保存先や閲覧記録に障害があるときは個人情報を表示せず再試行を案内する。 */
export default function AgentDataError({ reset }: { reset: () => void }) {
  return <div className="flex flex-col gap-5">
    <PageHeader title="情報を読み込めませんでした" />
    <Notice>少し待ってから、もう一度お試しください。</Notice>
    <PrimaryButton onClick={reset}>もう一度読み込む</PrimaryButton>
  </div>;
}
