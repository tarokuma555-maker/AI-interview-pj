import type { Metadata } from "next";
import { PocApp } from "@/components/poc/poc-app";

export const metadata: Metadata = {
  title: "音声会話の試作版 | AI面接練習",
  robots: { index: false, follow: false },
};

export default function PocPage() {
  return <PocApp />;
}
