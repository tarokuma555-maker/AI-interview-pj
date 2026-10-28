"use client";

import { useEffect, useState } from "react";

/** 待つ間に出す一言(実際の処理の順に近い並び。最後の一言のまま待つ) */
const STEPS = ["会話を保存しています", "回答を読み返しています", "良かった点を探しています", "次にやることをまとめています"];
const STEP_MS = 4000;

/**
 * 面接のあと、会話の保存と結果づくりを待つ間の表示(2026-10-28 依頼者の要望)。
 * 回る印と流れる帯で、動いていることが分かるようにする。視差効果を減らす設定の人には動きを出さない。
 */
export function ResultWaiting() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return (
    <section data-testid="result-waiting" aria-busy="true" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <p className="flex items-center gap-3 text-lg font-semibold" role="status" aria-live="polite">
        <span className="size-6 shrink-0 rounded-full border-4 border-border border-t-accent motion-safe:animate-spin" aria-hidden />
        {STEPS[step]}…
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-accent-soft" aria-hidden>
        <div className="h-full w-2/5 rounded-full bg-accent motion-safe:animate-[result-progress_1.6s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:opacity-40" />
      </div>
      <ol className="flex flex-col gap-1 text-sm" aria-hidden>
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? "text-success" : i === step ? "font-semibold" : "text-muted"}>
            {i < step ? "✓" : i === step ? "●" : "○"} {label}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">1分ほどかかります。この画面のままお待ちください。</p>
    </section>
  );
}
