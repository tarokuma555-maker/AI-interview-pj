import type { Metadata } from "next";
import { WelcomeScreen } from "@/components/app/welcome-screen";

export const metadata: Metadata = { title: "はじめての方へ | AI面接練習" };

export default function WelcomePage() {
  return <WelcomeScreen />;
}
