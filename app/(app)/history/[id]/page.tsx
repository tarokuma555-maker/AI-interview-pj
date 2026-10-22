import type { Metadata } from "next";
import { HistoryDetailScreen } from "@/components/app/history-screen";

export const metadata: Metadata = { title: "練習の結果 | AI面接練習" };

export default function Page() {
  return <HistoryDetailScreen />;
}
