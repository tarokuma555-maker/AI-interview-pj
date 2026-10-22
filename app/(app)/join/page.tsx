import type { Metadata } from "next";
import { JoinScreen } from "@/components/app/join-screen";

export const metadata: Metadata = { title: "招待 | AI面接練習", robots: { index: false, follow: false } };

export default function JoinPage() {
  return <JoinScreen />;
}
