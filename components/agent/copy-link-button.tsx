"use client";
import { useEffect, useRef, useState } from "react";
import { SecondaryButton } from "@/components/app/ui";
/** 設計 2026-10-27 4.1。コピーが使えない環境でも手動で選択できる。 */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false), [fallback, setFallback] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className="flex min-w-0 flex-col gap-2">
    <SecondaryButton onClick={async () => {
      try { await navigator.clipboard.writeText(url); setCopied(true); setFallback(false); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2000); }
      catch { setFallback(true); }
    }}>{copied ? "コピーしました" : "リンクをコピー"}</SecondaryButton>
    {copied && <span role="status" className="sr-only">コピーしました</span>}
    {fallback && <><p role="status">長押ししてコピーしてください</p><textarea aria-label="コピーする招待リンク" readOnly value={url} onFocus={e => e.currentTarget.select()} className="w-full min-w-0 break-all rounded border border-border p-2" /></>}
  </div>;
}
