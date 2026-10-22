"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AvatarView, isWideAvatar } from "@/components/poc/avatar-view";
import { setLeaveGuard } from "@/features/app/leave-guard";
import { roomMessage, STT_FALLBACK_NOTICE } from "@/features/app/messages";
import { STANDARD_AVATAR } from "@/features/avatar/manifest";
import type { InterviewController, RoomStatus } from "@/features/interview/client/interview-controller";
import { Notice, PrimaryButton, SecondaryButton } from "../ui";
import { MicMeter } from "./mic-meter";

type Turn = { label: string; tone: "interviewer" | "you" | "wait" };

const TURNS: Partial<Record<RoomStatus, Turn>> = {
  ready: { label: "まもなく始まります", tone: "wait" },
  speaking: { label: "面接官が話しています", tone: "interviewer" },
  listening: { label: "あなたの番です", tone: "you" },
  answering: { label: "あなたの番です", tone: "you" },
  waiting: { label: "面接官が考えています", tone: "wait" },
};

const TONE_CLASSES: Record<Turn["tone"], string> = {
  interviewer: "bg-accent text-accent-foreground",
  you: "bg-success text-white",
  wait: "bg-border text-foreground",
};

/**
 * 面接ルーム(要件 S-07、9.3)。面接官、いまの番、残り時間、「回答を終える」、終了だけを出す。
 * 応答時間や会話の記録などは出さない(検証ツールにだけ出す)。
 */
export function RoomStep({
  controller,
  stageLabel,
  captionsDefault,
}: {
  controller: InterviewController;
  stageLabel: string;
  captionsDefault: boolean;
}) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [captions, setCaptions] = useState(captionsDefault || snap.textMode);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const turn = TURNS[snap.status];
  const yourTurn = snap.status === "listening" || snap.status === "answering";
  const interviewer = STANDARD_AVATAR.interviewer?.name ?? "面接官";
  const message = roomMessage(snap.message);

  useKeepScreenOn();
  useWarnBeforeLeaving();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">
          {stageLabel}・面接官 {interviewer}
        </span>
        <span className="tabular-nums text-muted" aria-label="残り時間">
          {formatRemaining(snap.remainingSec)}
        </span>
      </div>

      <div
        className={`mx-auto w-full overflow-hidden rounded-2xl border-4 transition-colors ${isWideAvatar(STANDARD_AVATAR) ? "" : "max-w-80"} ${
          snap.status === "speaking" ? "border-accent" : "border-transparent"
        }`}
      >
        <AvatarView manifest={STANDARD_AVATAR} getInputs={controller.avatarInputs} />
      </div>

      {turn && (
        <p className={`rounded-2xl py-3 text-center text-xl font-bold ${TONE_CLASSES[turn.tone]}`} role="status" aria-live="polite">
          {turn.label}
        </p>
      )}

      {yourTurn && !snap.textMode && (
        <p className="text-center text-lg leading-relaxed text-balance [word-break:auto-phrase]">
          話し終えたら<strong>「以上です」</strong>と言ってください
        </p>
      )}

      {captions && snap.interviewerCaption && (
        <p className="rounded-xl bg-surface p-4 leading-relaxed">
          <span className="font-semibold">面接官:</span>
          {snap.interviewerCaption}
        </p>
      )}

      {message && <Notice tone="danger">{message}</Notice>}
      {snap.sttFallback && <Notice>{STT_FALLBACK_NOTICE}</Notice>}

      {!snap.textMode && <MicMeter level={snap.micLevel} />}

      {snap.textMode ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            controller.submitText(text);
            setText("");
          }}
          className="flex flex-col gap-3"
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            rows={5}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-base leading-relaxed"
            placeholder={snap.status === "listening" ? "回答を入力してください" : "面接官の質問のあとに入力できます"}
            aria-label="回答"
          />
          <PrimaryButton type="submit" disabled={snap.status !== "listening" || !text.trim()}>
            回答を送る
          </PrimaryButton>
        </form>
      ) : (
        <PrimaryButton onClick={() => controller.endAnswer()} disabled={!yourTurn}>
          回答を終える
        </PrimaryButton>
      )}

      {confirming ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4" role="alertdialog" aria-label="面接を終了しますか">
          <p className="font-bold">面接を終了しますか?</p>
          <p className="text-sm text-muted">ここまでの回答で、結果をお伝えします。</p>
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={() => setConfirming(false)}>続ける</SecondaryButton>
            <SecondaryButton onClick={() => void controller.finish()} className="border-danger text-danger">
              終了する
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <SecondaryButton onClick={() => setCaptions((c) => !c)} aria-pressed={captions}>
            字幕を{captions ? "消す" : "出す"}
          </SecondaryButton>
          <SecondaryButton onClick={() => setConfirming(true)}>面接を終了</SecondaryButton>
        </div>
      )}
    </div>
  );
}

function formatRemaining(sec: number | null): string {
  if (sec === null) return "";
  const abs = Math.abs(sec);
  const time = `${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return sec < 0 ? `時間を過ぎています ${time}` : `残り ${time}`;
}

/** 面接中は画面が暗くならないようにする(要件 F-05-15)。対応していない端末では何もしない */
function useKeepScreenOn() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const request = async () => {
      try {
        if (document.visibilityState === "visible" && "wakeLock" in navigator) lock = await navigator.wakeLock.request("screen");
        if (released) void lock?.release();
      } catch {
        // 省電力モードなどで断られても、面接は続ける
      }
    };
    void request();
    // 別のアプリから戻ったときに、もう一度お願いする
    document.addEventListener("visibilitychange", request);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

/** 面接中にページを閉じたり、ほかの画面に移ろうとしたら確認する */
function useWarnBeforeLeaving() {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    setLeaveGuard("面接の途中です。ほかの画面に移ると、面接は終わり、結果は残りません。移りますか?");
    return () => {
      window.removeEventListener("beforeunload", warn);
      setLeaveGuard(null);
    };
  }, []);
}
