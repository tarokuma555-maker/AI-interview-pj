"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { confirmLeave } from "@/features/app/leave-guard";
import { useAppData } from "@/features/app/store";
import { InviteForm } from "./invite-form";
import { Loading, PageHeader } from "./ui";

/** 招待なし・はじめての案内の前でも開ける画面 */
const OPEN_PATHS = new Set(["/join", "/help"]);

/**
 * 製品版の画面の枠(要件 9)。招待リンクから入っていなければ案内を出し、
 * はじめての案内を終えていなければ案内(/welcome)へ移る。
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const data = useAppData();
  const pathname = usePathname();
  const router = useRouter();
  const open = OPEN_PATHS.has(pathname);
  const needsWelcome = !!data?.accessCode && !data.onboardedAt && pathname !== "/welcome" && !open;

  useEffect(() => {
    if (needsWelcome) router.replace("/welcome");
  }, [needsWelcome, router]);

  let body: React.ReactNode = children;
  if (!data || needsWelcome) body = <Loading />;
  else if (!data.accessCode && !open) body = <InviteRequired />;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4">
          <Link href="/" onClick={guard} className="text-lg font-bold">
            AI面接練習
          </Link>
          <Link href="/help" onClick={guard} className="flex min-h-11 items-center px-2 text-muted underline-offset-4 hover:underline">
            困ったとき
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-16 pt-6">{body}</main>
    </div>
  );
}

function guard(event: React.MouseEvent) {
  if (!confirmLeave()) event.preventDefault();
}

function InviteRequired() {
  return (
    <>
      <PageHeader
        title="招待リンクから開いてください"
        lead="このアプリは、ご登録いただいた求職者の方のための面接練習アプリです。担当のキャリアアドバイザーから届いた招待リンクを開いてください。"
      />
      <InviteForm />
    </>
  );
}
