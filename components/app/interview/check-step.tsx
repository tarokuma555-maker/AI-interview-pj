"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { InterviewController } from "@/features/interview/client/interview-controller";
import { isInAppBrowser, micPermissionHelp, preparingLabel, prepareProblem } from "@/features/app/messages";
import { Card, ChoiceGroup, Notice, PageHeader, PrimaryButton, SecondaryButton } from "../ui";
import { MicMeter } from "./mic-meter";

/** 声が届いたとみなす音量(0〜1。およそ -40dB)と、続けて超えた回数 */
const VOICE_LEVEL = 0.4;
const VOICE_HITS = 3;

/**
 * 機器チェック(要件 S-06、F-05-1)。この画面のあいだに質問計画を作る。
 * 声が届くか・面接官の声が聞こえるかを確かめ、うまくいかないときは原因と対処、文字で答える面接への切り替えを示す。
 */
export function CheckStep({
  controller,
  beginDisabled = false,
  earphones,
  onEarphones,
  onBegin,
  onUseText,
  onRetry,
  onBack,
}: {
  controller: InterviewController;
  beginDisabled?: boolean;
  earphones: boolean;
  onEarphones: (earphones: boolean) => void;
  onBegin: () => void;
  onUseText: () => void;
  onRetry: () => void;
  onBack: () => void;
}) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [heard, setHeard] = useState(false);
  const [speakerResult, setSpeakerResult] = useState<"untested" | "testing" | "asking" | "ok" | "ng">("untested");
  const hits = useRef(0);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const voice = !snap.textMode;

  // 「よろしくお願いします」などの声が、少しの間続けて届いたら確認済みにする
  useEffect(
    () =>
      controller.subscribe(() => {
        const level = controller.getSnapshot().micLevel;
        hits.current = level >= VOICE_LEVEL ? hits.current + 1 : 0;
        if (hits.current >= VOICE_HITS) setHeard(true);
      }),
    [controller],
  );

  async function testSpeaker() {
    setSpeakerResult("testing");
    await controller.runEchoTest();
    setSpeakerResult("asking");
  }

  if (snap.status === "preparing" || snap.status === "idle") {
    return (
      <>
        <PageHeader title="準備しています" lead="少しお待ちください。この間に、あなたに合わせた質問を用意しています。" />
        <Card>
          <p className="flex items-center gap-3 text-lg" role="status" aria-live="polite">
            <span className="size-5 animate-spin rounded-full border-4 border-border border-t-accent" aria-hidden />
            {preparingLabel(snap.message)}
          </p>
          {voice && <p className="text-sm text-muted">マイクの使用を確認する画面が出たら、「許可」を選んでください。</p>}
        </Card>
      </>
    );
  }

  if (snap.status === "error") {
    const problem = prepareProblem(snap.message, userAgent);
    return (
      <>
        <PageHeader title={problem.title} />
        <Notice tone="danger">{problem.detail}</Notice>
        <PrimaryButton onClick={onRetry}>もう一度試す</PrimaryButton>
        {problem.canUseText && voice && <SecondaryButton onClick={onUseText}>文字で答える面接にする</SecondaryButton>}
        <SecondaryButton onClick={onBack}>準備の画面に戻る</SecondaryButton>
        <a href="/help#mic" target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center underline underline-offset-4">困ったときの対処を見る（別のタブで開きます）</a>
      </>
    );
  }

  return (
    <>
      <PageHeader title="音と声の確認" lead={voice ? "面接の前に、声が届くかを確かめます。" : "文字で答える面接です。面接官の声は流れます。"} />

      {voice && isInAppBrowser(userAgent) && <Notice tone="danger">{micPermissionHelp(userAgent)}</Notice>}

      {voice && (
        <Card>
          <h2 className="text-lg font-bold">1. 声が届くか</h2>
          <p>「よろしくお願いします」と、声に出して言ってみてください。</p>
          <MicMeter level={snap.micLevel} />
          <p className={`font-bold ${heard ? "text-success" : "text-muted"}`} role="status" aria-live="polite">
            {heard ? "✓ 声が届いています" : "声を待っています…"}
          </p>
        </Card>
      )}

      {voice && (
        <Card>
          <h2 className="text-lg font-bold">2. 面接官の声が聞こえるか</h2>
          {speakerResult === "untested" && <SecondaryButton onClick={() => void testSpeaker()}>テストの声を流す</SecondaryButton>}
          {speakerResult === "testing" && <p role="status">テストの声を流しています…</p>}
          {speakerResult === "asking" && (
            <>
              <p className="font-semibold">声は聞こえましたか?</p>
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => setSpeakerResult("ok")}>聞こえた</SecondaryButton>
                <SecondaryButton onClick={() => setSpeakerResult("ng")}>聞こえない</SecondaryButton>
              </div>
            </>
          )}
          {speakerResult === "ok" && <p className="font-bold text-success">✓ 聞こえています</p>}
          {speakerResult === "ng" && (
            <>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed">
                <li>端末の音量を上げてください。</li>
                <li>iPhone は、横のスイッチで消音(マナーモード)を解除してください。</li>
                <li>イヤホンがきちんとつながっているか確かめてください。</li>
              </ul>
              <SecondaryButton onClick={() => void testSpeaker()}>もう一度流す</SecondaryButton>
            </>
          )}
          {snap.echoTest?.echoLikely && !earphones && (
            <Notice>スピーカーの音をマイクが拾っています。イヤホンを使うと、面接官の声をあなたの声と間違えることがなくなります。</Notice>
          )}
        </Card>
      )}

      {voice && (
        <ChoiceGroup
          legend="イヤホンを使っていますか?"
          value={earphones ? "yes" : "no"}
          onChange={(value) => onEarphones(value === "yes")}
          options={[
            { value: "yes", label: "使っている" },
            { value: "no", label: "使っていない" },
          ]}
          columns={2}
        />
      )}

      <PrimaryButton onClick={onBegin} disabled={beginDisabled || (voice && !heard)}>
        面接を始める
      </PrimaryButton>
      {voice && !heard && <p className="-mt-3 text-center text-sm text-muted">声が届いたことを確かめると、始められます</p>}
      {voice && <SecondaryButton onClick={onUseText}>声が届かないので、文字で答える</SecondaryButton>}
    </>
  );
}
