import type { Metadata } from "next";
import { ProfileScreen } from "@/components/app/profile-screen";

export const metadata: Metadata = { title: "職種・経歴 | AI面接練習" };

export default function Page() {
  return <ProfileScreen />;
}
