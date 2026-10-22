"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isInvalidCode, loadConfig } from "@/features/app/access";
import { extractInviteCode } from "@/features/app/invite";
import { updateAppData } from "@/features/app/store";
import { Card, Notice, PrimaryButton } from "./ui";

/** 招待のコードを確かめて保存し、はじめての案内かホームへ進む */
export async function acceptInvite(code: string): Promise<"ok" | "invalid" | "error"> {
  if (!code) return "invalid";
  try {
    await loadConfig(code);
  } catch (error) {
    return isInvalidCode(error) ? "invalid" : "error";
  }
  updateAppData((data) => ({ ...data, accessCode: code }));
  return "ok";
}

export const INVITE_MESSAGES = {
  invalid: "この招待は使えません。担当のキャリアアドバイザーに、新しい招待リンクをお問い合わせください。",
  error: "サーバーにつながりませんでした。通信の状態を確かめて、もう一度お試しください。",
} as const;

/** 招待リンクの代わりに、招待のコード(またはリンク)を貼り付けて入る */
export function InviteForm() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await acceptInvite(extractInviteCode(value));
    setBusy(false);
    if (result === "ok") router.replace("/");
    else setError(INVITE_MESSAGES[result]);
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="font-bold">招待リンク・招待コード</span>
          <span className="text-sm text-muted">リンクを開けない場合は、届いたリンクかコードをここに貼り付けてください。</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            className="min-h-12 rounded-xl border border-border bg-background px-4 text-base"
          />
        </label>
        {error && <Notice tone="danger">{error}</Notice>}
        <PrimaryButton type="submit" disabled={busy || !value.trim()}>
          {busy ? "確かめています…" : "はじめる"}
        </PrimaryButton>
      </form>
    </Card>
  );
}
