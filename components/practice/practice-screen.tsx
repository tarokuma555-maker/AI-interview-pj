"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckStep } from "@/components/app/interview/check-step";
import { RoomStep } from "@/components/app/interview/room-step";
import { ResultView, Transcript } from "@/components/app/result-view";
import { Card, Loading, Notice, PageHeader, PrimaryButton, SecondaryButton } from "@/components/app/ui";
import { chooseServices, STAGE_CHOICES } from "@/features/app/interview-setup";
import { InterviewController } from "@/features/interview/client/interview-controller";
import { fetchConfig, type PocConfig } from "@/features/interview/client/poc-api";
import { isWebSpeechSupported } from "@/features/interview/client/stt/web-speech";
import { loadPractice, practiceRequest, retryPractice } from "@/features/practice/api";
import { canRetry } from "@/lib/practice-link/retry";
import type { PracticeSession, PracticeTarget } from "@/lib/practice-link/types";
const subscribeEmpty = () => () => undefined;
const snapshotEmpty = () => null;
/** 招待設計4.2。端末保存の旧画面と分離し、このリンクの記録だけを表示する。 */
function subscribeHash(notify: () => void) {
  window.addEventListener("hashchange",notify);
  window.addEventListener("popstate",notify);
  return () => { window.removeEventListener("hashchange",notify); window.removeEventListener("popstate",notify); };
}
export function PracticeScreen() {
  const key = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  return <PracticeSessionScreen key={key} linkKey={key} />;
}
function PracticeSessionScreen({ linkKey: key }: { linkKey: string }) {
  const [target, setTarget] = useState<PracticeTarget | null>(null);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [config, setConfig] = useState<PocConfig | null>(null);
  const [controller, setController] = useState<InterviewController | null>(null);
  const [step, setStep] = useState<"intro" | "check" | "room">("intro");
  const [earphones, setEarphones] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [selected, setSelected] = useState<PracticeSession | null>(null);
  const [retryState, setRetryState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const requestId = useRef<string | null>(null), starting = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const snap = useSyncExternalStore(controller?.subscribe ?? subscribeEmpty, controller?.getSnapshot ?? snapshotEmpty, snapshotEmpty);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const value = key;
      if (!/^[A-Za-z0-9_-]{22}$/.test(value)) throw new Error("この招待リンクは使えません。担当のエージェントにお問い合わせください。");
      const [data,cfg] = await Promise.all([loadPractice(value),fetchConfig(`practice:${value}`)]);
      if (!cancelled) { setTarget(data.target); setSessions(data.sessions); setConfig(cfg); }
    }
    void load().catch(e => { if (!cancelled) setMessage(e instanceof Error ? e.message : "読み込めませんでした"); });
    return () => { cancelled = true; };
  }, [key]);
  useEffect(() => () => controller?.dispose(), [controller]);
  useEffect(() => {
    if (snap?.status !== "finished") return;
    let cancelled = false;
    const refresh = () => loadPractice(key).then(data => { if (!cancelled) setSessions(data.sessions); }).catch(() => undefined);
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [key,snap?.status]);
  function prepare(answerBy: "voice" | "text") {
    if (!target || !config) return;
    controller?.dispose(); setMessage(""); setSelected(null);
    requestId.current = null; setActiveId(null);
    const next = new InterviewController(), services = chooseServices(config, answerBy, isWebSpeechSupported());
    setController(next); setStep("check");
    void next.prepare({ accessCode: `practice:${key}`, settings: { ...target.settings, voiceId: services.voiceId, answerBy }, context: target.context,
      sttProvider: services.stt, ttsProvider: services.tts, earphones, voiceGender: "male" });
  }
  async function begin() {
    if (!controller || starting.current || snap?.status !== "ready") return;
    starting.current = true; setBusy(true); setMessage("");
    requestId.current ??= crypto.randomUUID();
    try {
      const { session } = await practiceRequest<{ session: PracticeSession }>(`practice:${key}`, { action: "start", requestId: requestId.current, answerBy: snap.textMode ? "text" : "voice" });
      setActiveId(session.id);
      await controller.usePracticeSession(`practice:${key}:${session.id}`,session.settings,session.context);
      setTarget(t => t ? { ...t, settings: session.settings, context: session.context } : t);
      controller.start(); setStep("room");
    } catch (e) { setMessage(e instanceof Error ? e.message : "始められませんでした"); }
    finally { starting.current = false; setBusy(false); }
  }
  // 結果をまとめられなかった・止まった過去の練習を、もう一度まとめる(段階D)
  async function retry(id: string) {
    setRetryState("busy");
    try { await retryPractice(key, id); setRetryState("sent"); setSessions((await loadPractice(key)).sessions); }
    catch { setRetryState("error"); }
  }
  function again() { controller?.dispose(); setController(null); setStep("intro"); setSelected(null); setMessage(""); }
  if (!target || !config) return message ? <><Notice tone="danger">{message}</Notice><SecondaryButton onClick={() => window.location.reload()}>読み込み直す</SecondaryButton></> : <Loading />;
  const stage = STAGE_CHOICES.find(s => s.value === target.settings.stage)?.label ?? "";
  const previous = (id?: string) => {
    const index = sessions.findIndex(s => s.id === id);
    return sessions.slice(index < 0 ? 0 : index+1).find(s => s.result)?.score ?? null;
  };
  const againButton = <PrimaryButton onClick={again}>もう一度練習する</PrimaryButton>;
  if (selected) return <><PageHeader title="練習の結果" />{selected.result
    ? <ResultView result={selected.result} history={selected.history} previousScore={previous(selected.id)} actions={<SecondaryButton onClick={() => setSelected(null)}>戻る</SecondaryButton>} />
    : <>{retryState === "sent"
        ? <Notice tone="success">結果をまとめています。1分ほどしてから、もう一度開いてください。</Notice>
        : <Notice>{canRetry(selected) ? "結果をまとめられませんでした。会話の記録は保存されています。" : selected.evaluation === "pending" ? "結果をまとめています。少し待ってから開き直してください。" : "結果はまだありません。会話の記録を見返せます。"}</Notice>}
      {retryState === "error" && <Notice tone="danger">いまはまとめられません。少し待ってからもう一度お試しください。</Notice>}
      {canRetry(selected) && retryState !== "sent" && <PrimaryButton disabled={retryState === "busy"} onClick={() => void retry(selected.id)}>もう一度まとめる</PrimaryButton>}
      <Transcript history={selected.history} open /><SecondaryButton onClick={() => { setSelected(null); setRetryState("idle"); }}>戻る</SecondaryButton></>}</>;
  if (step === "room" && controller && snap) {
    if (snap.status !== "finished") return <RoomStep controller={controller} stageLabel={stage} captionsDefault />;
    return <><PageHeader title="面接おつかれさまでした" />{snap.feedback.status === "done"
      ? <ResultView result={snap.feedback.result} history={snap.history} previousScore={previous(activeId ?? undefined)} actions={againButton} />
      : <><Notice>{snap.feedback.status === "failed" ? "結果を確認できませんでした。もう一度お試しください。" : snap.feedback.status === "no_answers" ? "回答がなかったため、結果はありません。" : "会話を保存し、結果をまとめています。保存が終わるまでお待ちください。"}</Notice><Transcript history={snap.history} open />{snap.feedback.status === "failed" && <SecondaryButton onClick={() => void controller.requestFeedback()}>保存と結果をもう一度確認する</SecondaryButton>}{againButton}</>}</>;
  }
  return <>
    <PageHeader title={`${target.context.companyName} ${stage}の練習`} lead={`${target.name}さん・約${target.settings.durationMin}分`} />
    <Notice>練習の結果は、担当のエージェントにも共有されます。録音はしません。</Notice>
    <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">練習の内容と結果の取り扱い</summary>
      <p className="mt-3">声は文字にするためだけに使い、音声は保存しません。会話の文字と結果はサーバーに保存し、本人と担当のエージェントが確認します。応募先の病院・企業には渡しません。AIによる評価は練習の参考で、合否を予測するものではありません。「面接を始める」を押すと、この取り扱いに同意したことになります。</p>
    </details>
    {message && <Notice tone="danger">{message}</Notice>}
    {step === "check" && controller ? <div aria-busy={busy} className={busy ? "pointer-events-none opacity-60" : ""}>
      <div className="flex flex-col gap-5"><CheckStep controller={controller} earphones={earphones} onEarphones={v => { setEarphones(v); controller.setEarphones(v); }} beginDisabled={busy} onBegin={() => void begin()} onUseText={() => prepare("text")} onRetry={() => prepare(snap?.textMode ? "text" : "voice")} onBack={again} /></div>
      {busy && <p role="status">面接を始めています…</p>}
    </div> : <><PrimaryButton onClick={() => prepare("voice")}>音と声を確認する</PrimaryButton><SecondaryButton onClick={() => prepare("text")}>文字で答える面接にする</SecondaryButton></>}
    <h2 className="text-xl font-bold">これまでの練習</h2>
    {!sessions.length && <p>これから最初の練習を始められます。</p>}
    {sessions.map(s => <Card key={s.id}><p>{new Date(s.startedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}・{s.score === null ? s.evaluation === "failed" ? "結果を作成できませんでした" : s.evaluation === "done" ? "回答なし" : s.finishedAt ? "結果を準備中" : "面接を開始しました" : `${s.score}点`}</p>
      {s.finishedAt && <SecondaryButton onClick={() => { controller?.dispose(); setController(null); setStep("intro"); setSelected(s); }}>結果を見る</SecondaryButton>}</Card>)}
  </>;
}
