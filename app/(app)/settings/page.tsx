import type { Metadata } from "next";
import { SettingsScreen } from "@/components/app/settings-screen";

export const metadata: Metadata = { title: "設定 | AI面接練習" };

export default function Page() {
  return <SettingsScreen />;
}
