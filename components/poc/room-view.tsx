"use client";

import { useState, useSyncExternalStore } from "react";
import type { AvatarManifest } from "@/features/avatar/manifest";
import type { InterviewController, RoomStatus } from "@/features/interview/client/interview-controller";
import { AvatarView, isWideAvatar } from "./avatar-view";
import { FeedbackView } from "./feedback-view";
import { LatencyPanel } from "./latency-panel";

const STATUS_LABELS: Record<RoomStatus, string> = {
  idle: "",
  preparing: "準備中",
  ready: "準備ができました",
  speaking: "面接官が話しています",
  listening: "お話しください",
  answering: "聞いています",
  waiting: "考えています",
  finished: "面接は終了しました",
  error: "エラー",
};

const PHASE_LABELS = {
  opening: "冒頭",
  main: "本編",
  reverse_questions: "逆質問",
  closing: "クロージング",
  ended: "終了",
} as const;

export function RoomView({
  controller,
  avatar,
  onReset,
}: {
  controller: InterviewController;
  /** 表示しない場合は null */
  avatar: AvatarManifest | null;
  onReset: () => void;
}) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [captions, setCaptions] = useState(true);
  const [text, setText] = useState("");
  const textMode = snap.textMode;
  const inInterview = ["speaking", "listening", "answering", "waiting"].includes(snap.status);

  function download() {
    const blob = new Blob([JSON.stringify(controller.exportResult(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interview-poc-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between text-sm text-muted">
          <span>{PHASE_LABELS[snap.phase]}</span>
          <span aria-label="残り時間">{snap.status === "finished" ? "" : formatRemaining(snap.remainingSec)}</span>
        </div>

        <div className="flex flex-col items-center gap-3 py-4">
          {avatar ? (
            <div
              className={`w-full overflow-hidden rounded-2xl border-4 transition-colors ${isWideAvatar(avatar) ? "max-w-2xl" : "max-w-64 sm:max-w-80"} ${
                snap.status === "speaking" ? "border-accent" : "border-border"
              }`}
            >
              <AvatarView manifest={avatar} getInputs={controller.avatarInputs} />
            </div>
          ) : (
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full border-4 text-lg font-bold ${
                snap.status === "speaking" ? "border-accent" : "border-border"
              }`}
              aria-hidden
            >
              面接官
            </div>
          )}
          <p className="text-lg font-semibold" role="status" aria-live="polite">
            {STATUS_LABELS[snap.status]}
          </p>
          {snap.message && <p className="text-center text-sm text-danger">{snap.message}</p>}
        </div>

        {/* 字幕は面接官の発言だけ。自分の発言は、下の「会話の記録」で確認できる */}
        {captions && inInterview && (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p>
              <span className="font-semibold">面接官:</span>
              {snap.interviewerCaption}
            </p>
          </div>
        )}

        {!textMode && (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-14 text-muted">マイク</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-background">
              <div className="h-full bg-accent transition-[width] duration-100" style={{ width: `${Math.round(snap.micLevel * 100)}%` }} />
            </div>
          </div>
        )}

        {snap.status === "ready" && (
          <div className="flex flex-col gap-3">
            {!textMode && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button type="button" onClick={() => void controller.runEchoTest()} className="rounded-lg border border-border px-3 py-2">
                  スピーカーのエコーを確認
                </button>
                {snap.echoTest && (
                  <span>
                    再生中の音量増加: {snap.echoTest.deltaDb} dB
                    {snap.echoTest.echoLikely ? "(エコーあり。イヤホンの使用をおすすめします)" : "(問題なし)"}
                  </span>
                )}
              </div>
            )}
            <button type="button" onClick={() => controller.start()} className="rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground">
              面接を開始
            </button>
          </div>
        )}

        {snap.sttFallback && (
          <p role="alert" className="rounded-lg border border-border bg-background p-3 text-sm text-danger">
            {snap.sttFallback}
          </p>
        )}

        {inInterview && textMode && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              controller.submitText(text);
              setText("");
            }}
            className="flex flex-col gap-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              className="min-h-24 rounded-lg border border-border bg-background px-3 py-2"
              placeholder="回答を入力してください"
              aria-label="回答"
            />
            <button type="submit" disabled={snap.status !== "listening" || !text.trim()} className="self-start rounded-lg bg-accent px-4 py-2 font-semibold text-accent-foreground disabled:opacity-50">
              回答を送る
            </button>
          </form>
        )}

        {inInterview && !textMode && (
          <button
            type="button"
            onClick={() => controller.endAnswer()}
            disabled={snap.status !== "listening" && snap.status !== "answering"}
            className="rounded-lg bg-accent px-5 py-3 font-semibold text-accent-foreground disabled:opacity-40"
          >
            回答を終える
          </button>
        )}

        <div className="flex flex-wrap gap-3 text-sm">
          {inInterview && (
            <>
              <button type="button" onClick={() => setCaptions((c) => !c)} className="rounded-lg border border-border px-3 py-2">
                字幕を{captions ? "隠す" : "表示"}
              </button>
              <button type="button" onClick={() => void controller.finish()} className="rounded-lg border border-border px-3 py-2">
                面接を終了
              </button>
            </>
          )}
          {(snap.status === "finished" || snap.status === "error" || snap.status === "ready") && (
            <button type="button" onClick={onReset} className="rounded-lg border border-border px-3 py-2">
              設定に戻る
            </button>
          )}
          {snap.history.length > 0 && (
            <button type="button" onClick={download} className="rounded-lg border border-border px-3 py-2">
              結果をJSONで保存
            </button>
          )}
        </div>
      </section>

      <FeedbackView state={snap.feedback} onRetry={() => void controller.requestFeedback()} />

      <LatencyPanel records={snap.latencies} />

      {snap.history.length > 0 && (
        <details className="rounded-xl border border-border bg-surface p-5" open={snap.status === "finished"}>
          <summary className="cursor-pointer font-bold">会話の記録</summary>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {snap.history
              .filter((t) => t.speaker !== "system")
              .map((t, i) => (
                <li key={i}>
                  <span className="font-semibold">{t.speaker === "interviewer" ? "面接官" : "あなた"}:</span>
                  {t.text}
                  {t.interrupted && <span className="text-muted">(途中で割り込み)</span>}
                  {t.charsPerMinute !== undefined && <span className="text-muted">(1分あたり{t.charsPerMinute}字)</span>}
                </li>
              ))}
          </ol>
        </details>
      )}

      {snap.plan && (
        <details className="rounded-xl border border-border bg-surface p-5">
          <summary className="cursor-pointer font-bold">質問計画({snap.plan.questions.length}問)</summary>
          <ol className="mt-3 list-decimal pl-5 text-sm">
            {snap.plan.questions.map((q) => (
              <li key={q.id}>
                {q.text}(優先度{q.priority})
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function formatRemaining(sec: number | null): string {
  if (sec === null) return "";
  const sign = sec < 0 ? "超過 " : "残り ";
  const abs = Math.abs(sec);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}
