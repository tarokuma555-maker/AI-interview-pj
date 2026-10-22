"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_POINTS } from "@/features/app/consent";
import { Details } from "./result-view";
import { PageHeader, SecondaryLink } from "./ui";

/** よくある質問と困ったときの対処(要件 S-17、F-14-1)。各画面の「困ったとき」から開く */
const FAQ: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "how",
    title: "どのように進みますか?",
    body: (
      <ol className="flex list-decimal flex-col gap-1 pl-5">
        <li>ホームの「面接を練習する」を押し、内容を確かめて「このまま始める」を押します。</li>
        <li>声が届くかを確かめたら、「面接を始める」を押します。</li>
        <li>面接官の質問に声で答え、話し終えたら「以上です」と言います。</li>
        <li>面接が終わると、良かった点と次に直すとよい点が表示されます。</li>
      </ol>
    ),
  },
  {
    id: "mic",
    title: "マイクが使えない・声が届かない",
    body: (
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>マイクの使用を確認する画面が出たら「許可」を選んでください。</li>
        <li>iPhone は「設定」→「Safari」→「マイク」を「許可」にしてください。</li>
        <li>Android は、アドレスバーの左のマークから「マイク」を「許可」にしてください。</li>
        <li>LINE などのアプリの中で開いている場合は、メニューから「ブラウザで開く」を選んでください。</li>
        <li>どうしても声が届かない場合は、「文字で答える」で練習できます。</li>
      </ul>
    ),
  },
  {
    id: "sound",
    title: "面接官の声が聞こえない",
    body: (
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>端末の音量を上げてください。</li>
        <li>iPhone は、横のスイッチで消音(マナーモード)を解除してください。</li>
        <li>面接中に「字幕を出す」を押すと、面接官の言葉を文字で読めます。</li>
      </ul>
    ),
  },
  {
    id: "next",
    title: "話し終えたのに、面接官が話し始めない",
    body: (
      <p>
        考えている途中で話を遮らないよう、回答の最後に「以上です」と言うまで待っています。「以上です」と言うか、「回答を終える」を押してください。10秒ほど黙っていても、回答が終わったと判断します。
      </p>
    ),
  },
  {
    id: "stopped",
    title: "途中で止まった・画面を閉じてしまった",
    body: (
      <p>
        通信が不安定なときは、少し待つと面接官がもう一度お願いします。画面を閉じてしまった場合は、お手数ですが最初からやり直してください。終了まで進んだ練習は「練習の記録」に残ります。
      </p>
    ),
  },
  {
    id: "data",
    title: "データの扱い",
    body: (
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {CONSENT_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
        <li>このブラウザのデータは、「設定」からいつでも削除できます。</li>
      </ul>
    ),
  },
  {
    id: "contact",
    title: "それでも解決しないとき",
    body: <p>担当のキャリアアドバイザーにご連絡ください。お使いの端末(iPhone・Android・パソコン)と、困ったときの画面の様子を教えていただけると、スムーズにご案内できます。</p>,
  },
];

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function HelpScreen() {
  // 「困ったとき」の該当箇所(/help#mic など)から開いたら、その項目を開いておく
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  return (
    <>
      <PageHeader title="困ったとき" />
      <div className="flex flex-col gap-3">
        {FAQ.map((item) => (
          <div key={item.id} id={item.id} className="scroll-mt-4">
            <Details key={hash} title={item.title} open={hash === item.id}>
              <div className="leading-relaxed">{item.body}</div>
            </Details>
          </div>
        ))}
      </div>
      <SecondaryLink href="/">ホームに戻る</SecondaryLink>
    </>
  );
}
