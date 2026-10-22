import type { Metadata } from "next";
import { HelpScreen } from "@/components/app/help-screen";

export const metadata: Metadata = { title: "困ったとき | AI面接練習" };

export default function Page() {
  return <HelpScreen />;
}
