"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { extractInviteCode } from "@/features/app/invite";
import { acceptInvite, InviteForm, INVITE_MESSAGES } from "./invite-form";
import { Loading, Notice, PageHeader } from "./ui";

/**
 * 招待リンク(/join#コード)を開いたときの画面(要件 F-01-1。ログイン機能ができるまでの入口)。
 * コードは「#」の後ろに置き、サーバーのアクセスログに残らないようにする。
 */
export function JoinScreen() {
  const router = useRouter();
  const [result, setResult] = useState<"checking" | "no_code" | keyof typeof INVITE_MESSAGES>("checking");

  useEffect(() => {
    const check = () => {
      const code = extractInviteCode(window.location.hash);
      // 履歴やブックマークにコードを残さない
      window.history.replaceState(null, "", window.location.pathname);
      void (code ? acceptInvite(code) : Promise.resolve("no_code" as const)).then((next) => {
        if (next === "ok") router.replace("/");
        else setResult(next);
      });
    };
    // 同じタブで別の招待リンクを開いたとき(「#」より後ろだけが変わる)も確かめ直す
    const onHashChange = () => {
      setResult("checking");
      check();
    };
    check();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [router]);

  if (result === "checking") return <Loading label="招待を確かめています…" />;
  return (
    <>
      <PageHeader title="ようこそ" lead="招待リンクから、AI面接練習をはじめます。" />
      {result !== "no_code" && <Notice tone="danger">{INVITE_MESSAGES[result]}</Notice>}
      <InviteForm />
    </>
  );
}
