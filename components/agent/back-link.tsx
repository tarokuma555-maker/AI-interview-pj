"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { agentBackHref } from "@/lib/auth/routes";

/** エージェントの画面の上部の「戻る」(2026-10-28 依頼者の要望) */
export function BackLink() {
  const href = agentBackHref(usePathname());
  if (!href) return null;
  return (
    <Link href={href} className="flex min-h-11 items-center gap-1 pr-2 font-semibold text-accent underline-offset-4 hover:underline">
      <span aria-hidden>←</span>戻る
    </Link>
  );
}
