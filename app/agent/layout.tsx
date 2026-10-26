import Link from "next/link";

/** エージェントの画面の枠(設計 2026-10-27 4.1)。求職者の画面とは別にする */
export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4">
          <Link href="/agent" className="text-lg font-bold">
            AI面接練習
          </Link>
          <span className="text-sm text-muted">エージェント</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
