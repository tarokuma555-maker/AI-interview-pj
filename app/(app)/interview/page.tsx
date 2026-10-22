import type { Metadata } from "next";
import { InterviewScreen } from "@/components/app/interview/interview-screen";

export const metadata: Metadata = { title: "面接 | AI面接練習" };

export default function InterviewPage() {
  return <InterviewScreen />;
}
