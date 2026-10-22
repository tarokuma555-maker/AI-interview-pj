"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAppConfig } from "@/features/app/access";
import { buildContext, buildControllerConfig, currentChoice, STAGE_CHOICES } from "@/features/app/interview-setup";
import { newId, saveSession, updateAppData, useAppData, useSessions, type InterviewChoice } from "@/features/app/store";
import { InterviewController, type Snapshot } from "@/features/interview/client/interview-controller";
import { isWebSpeechSupported } from "@/features/interview/client/stt/web-speech";
import { ResultView, Transcript } from "../result-view";
import { Card, Loading, Notice, PageHeader, PrimaryButton, SecondaryButton, SecondaryLink } from "../ui";
import { CheckStep } from "./check-step";
import { PrepareStep } from "./prepare-step";
import { RoomStep } from "./room-step";

const EMPTY_SUBSCRIBE = () => () => undefined;
const NO_SNAPSHOT = () => null;

function useSnapshot(controller: InterviewController | null): Snapshot | null {
  return useSyncExternalStore(controller?.subscribe ?? EMPTY_SUBSCRIBE, controller?.getSnapshot ?? NO_SNAPSHOT, controller?.getSnapshot ?? NO_SNAPSHOT);
}

/**
 * 面接の画面(要件 S-05〜S-09)。準備 → 機器チェック → 面接ルーム → 結果 を1つの画面の中で進める
 * (面接の進行の状態を、画面を移っても失わないようにするため)。
 */
export function InterviewScreen() {
  const data = useAppData();
  const sessions = useSessions();
  const { state: config, retry } = useAppConfig(data?.accessCode ?? null);
  const [step, setStep] = useState<"prepare" | "check" | "room">("prepare");
  const [controller, setController] = useState<InterviewController | null>(null);
  const [choice, setChoice] = useState<InterviewChoice | null>(null);
  const [session, setSession] = useState<{ id: string; startedAt: string } | null>(null);
  const finishedAt = useRef<string | null>(null);
  const snap = useSnapshot(controller);

  useEffect(() => () => controller?.dispose(), [controller]);

  // 面接が終わったら、練習の記録に残す(評価ができたら、評価を加えて残し直す)
  useEffect(() => {
    if (!data || !session || !choice || snap?.status !== "finished") return;
    if (!snap.history.some((turn) => turn.speaker === "candidate")) return;
    finishedAt.current ??= new Date().toISOString();
    const context = buildContext(data, choice);
    saveSession({
      ...session,
      finishedAt: finishedAt.current,
      choice,
      companyName: context.companyName,
      position: context.position,
      history: snap.history.map((turn) => ({ ...turn, llmContent: undefined, sentences: undefined })),
      feedback: snap.feedback.status === "done" ? snap.feedback.result : null,
    });
  }, [data, session, choice, snap?.status, snap?.history, snap?.feedback]);

  if (!data || !sessions) return <Loading />;

  if (config.status === "invalid") {
    return (
      <>
        <PageHeader title="招待の期限が切れています" lead="担当のキャリアアドバイザーに、新しい招待リンクをお問い合わせください。" />
        <SecondaryButton onClick={() => updateAppData((d) => ({ ...d, accessCode: null }))}>招待リンクを入れ直す</SecondaryButton>
      </>
    );
  }
  if (config.status === "error") {
    return (
      <>
        <Notice tone="danger">{config.message}</Notice>
        <PrimaryButton onClick={retry}>もう一度試す</PrimaryButton>
      </>
    );
  }

  function prepare(next: InterviewChoice) {
    if (config.status !== "ready" || !data?.accessCode) return;
    controller?.dispose();
    const created = new InterviewController();
    setChoice(next);
    setController(created);
    setSession(null);
    finishedAt.current = null;
    setStep("check");
    // マイクと音の再生の準備は、ボタンを押した流れの中で始める(ブラウザの制限のため)
    void created.prepare(buildControllerConfig(data, next, config.config, data.accessCode, isWebSpeechSupported()));
  }

  function begin() {
    if (!controller) return;
    setSession({ id: newId(), startedAt: new Date().toISOString() });
    controller.start();
    setStep("room");
  }

  function again() {
    controller?.dispose();
    setController(null);
    setStep("prepare");
  }

  if (step === "prepare" || !controller || !choice || !snap) {
    return (
      <PrepareStep
        data={data}
        initial={choice ?? currentChoice(data)}
        ready={config.status === "ready"}
        onStart={(next) => {
          updateAppData((d) => ({ ...d, lastChoice: next }));
          prepare(next);
        }}
      />
    );
  }

  if (step === "check") {
    return (
      <CheckStep
        controller={controller}
        earphones={data.preferences.earphones}
        onEarphones={(earphones) => {
          controller.setEarphones(earphones);
          updateAppData((d) => ({ ...d, preferences: { ...d.preferences, earphones } }));
        }}
        onBegin={begin}
        onUseText={() => prepare({ ...choice, answerBy: "text" })}
        onRetry={() => prepare(choice)}
        onBack={again}
      />
    );
  }

  if (snap.status !== "finished") {
    return (
      <RoomStep
        controller={controller}
        stageLabel={STAGE_CHOICES.find((s) => s.value === choice.stage)?.label ?? ""}
        captionsDefault={data.preferences.captions}
      />
    );
  }

  const previousScore = sessions.find((s) => s.id !== session?.id && s.feedback)?.feedback?.feedback.overall_score ?? null;
  const buttons = (
    <div className="flex flex-col gap-3">
      <PrimaryButton onClick={again}>もう一度練習する</PrimaryButton>
      <SecondaryLink href="/">ホームに戻る</SecondaryLink>
    </div>
  );

  return (
    <>
      <PageHeader title="面接おつかれさまでした" />
      {snap.feedback.status === "done" ? (
        <ResultView result={snap.feedback.result} history={snap.history} previousScore={previousScore} actions={buttons} />
      ) : (
        <>
          {(snap.feedback.status === "loading" || snap.feedback.status === "none") && (
            <Card>
              <p className="flex items-center gap-3 text-lg font-semibold" role="status" aria-live="polite">
                <span className="size-5 animate-spin rounded-full border-4 border-border border-t-accent" aria-hidden />
                結果をまとめています
              </p>
              <p className="text-muted">1分ほどかかります。待つ間に、下の会話の記録を読み返せます。</p>
            </Card>
          )}
          {snap.feedback.status === "failed" && (
            <>
              <Notice tone="danger">結果をまとめられませんでした。会話の記録は残っています。</Notice>
              <PrimaryButton onClick={() => void controller.requestFeedback()}>もう一度まとめる</PrimaryButton>
            </>
          )}
          {snap.feedback.status === "no_answers" && <Notice>回答がなかったため、結果はありません。</Notice>}
          <Transcript history={snap.history} open />
          {snap.feedback.status !== "loading" && buttons}
        </>
      )}
    </>
  );
}
