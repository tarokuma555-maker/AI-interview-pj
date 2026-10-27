import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, SecondaryLink } from "@/components/app/ui";

export const metadata: Metadata = {
  title: "以前の招待リンクについて | AI面接練習",
  robots: { index: false, follow: false },
};

export default function JoinPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-10">
      <PageHeader
        title="この招待リンクの受付は終了しました"
        lead="面接練習の入口が新しくなりました。以前の招待リンク・共通の招待コードは、ここでは使えません。"
      />
      <Card>
        <h2 className="text-xl font-bold">担当者から届いた新しいリンクを開いてください</h2>
        <p className="leading-relaxed">
          新しい招待リンクが見つからないときは、担当のエージェントにお問い合わせください。求職者の方のログインは必要ありません。
        </p>
      </Card>
      <SecondaryLink href="/">AI面接練習の案内へ</SecondaryLink>
      <Link href="/privacy" className="inline-flex min-h-12 items-center text-accent underline underline-offset-4">
        個人情報・練習データの取り扱い
      </Link>
    </main>
  );
}
