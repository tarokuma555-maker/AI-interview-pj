import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, PrimaryLink } from "@/components/app/ui";

export const metadata: Metadata = {
  title: "AI面接練習",
  description: "担当のエージェントから届いた招待リンクで、AIと面接を練習できます。声でも文字でも回答できます。",
};

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <PageHeader
        title="AI面接練習"
        lead="本番に向けて、AIの面接官と練習できます。声でも文字でも、自分に合った方法で答えられます。"
      />
      <Card tone="accent">
        <h2 className="text-xl font-bold">面接を練習する方へ</h2>
        <p className="leading-relaxed">
          担当のエージェントから届いた招待リンクを開いてください。求職者の方のログインや登録は必要ありません。
        </p>
        <p className="leading-relaxed">
          招待リンクが見つからない・開けないときは、担当のエージェントに新しいリンクをお尋ねください。
        </p>
      </Card>
      <Card>
        <h2 className="text-xl font-bold">担当エージェントの方へ</h2>
        <p className="leading-relaxed">ログインすると、求職者・応募先の登録、招待リンクの作成、練習結果の確認ができます。</p>
        <PrimaryLink href="/agent/login">エージェントのログイン</PrimaryLink>
      </Card>
      <footer>
        <Link href="/privacy" className="inline-flex min-h-12 items-center text-accent underline underline-offset-4">
          個人情報・練習データの取り扱い
        </Link>
      </footer>
    </main>
  );
}
