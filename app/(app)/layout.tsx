import { AppShell } from "@/components/app/app-shell";

/** 求職者が使う画面(要件 9)。試作版(/poc)は管理者向けの検証ツールとして別に置く */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
