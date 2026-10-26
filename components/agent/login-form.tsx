"use client";

import { useState, useTransition } from "react";
import { requestCode, submitCode } from "@/app/agent/actions";
import { Card, Notice, PrimaryButton, SecondaryButton, TextInput } from "@/components/app/ui";

/** エージェントのログイン(設計 2026-10-27 7章)。メールのボタンか、6桁の確認コードでログインする */
export function LoginForm({ notice }: { notice: string | null }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<{ devCode?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await requestCode(email);
      if (result.ok) {
        setSent({ devCode: result.devCode });
        setCode("");
      } else setError(result.message);
    });
  }

  function login() {
    setError(null);
    startTransition(async () => {
      const result = await submitCode(email, code);
      if (result && !result.ok) setError(result.message);
    });
  }

  return (
    <>
      {notice && !sent && <Notice tone="danger">{notice}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {sent ? (
        <>
          <Notice tone="success">
            メールを送りました。メールのボタンを押すか、メールに書かれた6桁の確認コードを入れてください。
          </Notice>
          {sent.devCode && <Notice>開発用の確認コード:{sent.devCode}(メールは送っていません)</Notice>}
          <Card>
            <TextInput label="確認コード(6桁)" value={code} onChange={setCode} maxLength={20} inputMode="numeric" autoComplete="one-time-code" />
          </Card>
          <PrimaryButton onClick={login} disabled={pending || !code.trim()}>
            ログインする
          </PrimaryButton>
          <SecondaryButton onClick={() => setSent(null)} disabled={pending}>
            メールアドレスを入れ直す
          </SecondaryButton>
        </>
      ) : (
        <>
          <Card>
            <TextInput label="メールアドレス" type="email" value={email} onChange={setEmail} maxLength={254} autoComplete="email" placeholder="例:name@example.com" />
          </Card>
          <PrimaryButton onClick={send} disabled={pending || !email.trim()}>
            ログインのメールを送る
          </PrimaryButton>
        </>
      )}
    </>
  );
}
