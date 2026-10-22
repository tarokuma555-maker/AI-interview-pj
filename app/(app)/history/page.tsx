import type { Metadata } from "next";
import { HistoryScreen } from "@/components/app/history-screen";

export const metadata: Metadata = { title: "練習の記録 | AI面接練習" };

export default function Page() {
  return <HistoryScreen />;
}
