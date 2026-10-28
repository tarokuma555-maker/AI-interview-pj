import type { Metadata } from "next";
import { Card, PageHeader, SecondaryLink } from "@/components/app/ui";

export const metadata: Metadata = { title: "困ったとき | AI面接練習" };

export default function HelpPage() {
  return <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 leading-relaxed">
    <PageHeader title="困ったとき" lead="この説明を別のタブで開いた場合は、元のタブへ戻って練習を続けられます。" />
    <section id="mic"><Card>
      <h2 className="text-xl font-bold">マイクが使えない・声が届かない</h2>
      <p>ブラウザからマイクの使用を確認されたら「許可」を選んでください。拒否した場合は、ブラウザや端末の設定で、このサイトのマイクを許可してから開き直してください。</p>
      <p>LINEなどのアプリ内で開いている場合は、メニューからSafariやChromeなどのブラウザで開いてください。</p>
      <p>設定を直したら、練習の画面の「もう一度試す」を押してください。それでも声が届かない場合は、招待リンクを送った担当のエージェントにご相談ください。</p>
    </Card></section>
    <Card><h2 className="text-xl font-bold">面接官の声が聞こえない</h2>
      <p>端末の音量・消音設定・イヤホンの接続先を確認してください。面接中は字幕でも質問を確認できます。</p>
    </Card>
    <Card><h2 className="text-xl font-bold">話し終えたのに進まない</h2>
      <p>回答の最後に「以上です」と言うか、「回答を終える」を押してください。10秒ほど黙っていても回答の終了と判断します。</p>
    </Card>
    <Card><h2 className="text-xl font-bold">途中で止まった・リンクが開けない</h2>
      <p>通信を確認し、担当者から届いた同じ招待リンクを開き直してください。終了して保存された練習は履歴から確認できます。保存前に閉じた面接の途中回答は復元できません。</p>
      <p>解決しない場合は、招待リンクを送った担当のエージェントへ、端末の種類と困っている画面をお伝えください。</p>
    </Card>
    <SecondaryLink href="/privacy">個人情報・練習データの取り扱い</SecondaryLink>
    <SecondaryLink href="/">AI面接練習の案内へ</SecondaryLink>
  </main>;
}
