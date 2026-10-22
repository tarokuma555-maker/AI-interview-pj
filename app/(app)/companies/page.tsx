import type { Metadata } from "next";
import { CompaniesScreen } from "@/components/app/companies-screen";

export const metadata: Metadata = { title: "応募先 | AI面接練習" };

export default function Page() {
  return <CompaniesScreen />;
}
