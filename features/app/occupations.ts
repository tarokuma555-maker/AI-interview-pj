/**
 * はじめての案内で選ぶ職種(要件 F-02-1、F-13-2)。主な利用者の医療・福祉職を先に並べ、
 * それ以外の職種も選べるようにする(要件 Q15 の前提)。
 */
export type Occupation = { id: string; label: string };

export const OCCUPATION_GROUPS: { label: string; items: Occupation[] }[] = [
  {
    label: "医療",
    items: [
      { id: "nurse", label: "看護師" },
      { id: "assistant_nurse", label: "准看護師" },
      { id: "midwife", label: "助産師" },
      { id: "public_health_nurse", label: "保健師" },
      { id: "pharmacist", label: "薬剤師" },
      { id: "pt", label: "理学療法士" },
      { id: "ot", label: "作業療法士" },
      { id: "st", label: "言語聴覚士" },
      { id: "lab_tech", label: "臨床検査技師" },
      { id: "radiology_tech", label: "診療放射線技師" },
      { id: "ce", label: "臨床工学技士" },
      { id: "dietitian", label: "管理栄養士・栄養士" },
      { id: "dental_hygienist", label: "歯科衛生士" },
      { id: "medical_clerk", label: "医療事務" },
    ],
  },
  {
    label: "介護・福祉",
    items: [
      { id: "care_worker", label: "介護職(介護福祉士など)" },
      { id: "care_manager", label: "ケアマネジャー" },
      { id: "social_worker", label: "社会福祉士・相談員" },
      { id: "nursery_teacher", label: "保育士" },
    ],
  },
  {
    label: "そのほか",
    items: [{ id: "other", label: "そのほかの職種" }],
  },
];

const ALL = OCCUPATION_GROUPS.flatMap((group) => group.items);

/** 職種の表示名。「そのほか」は書いてもらった職種名にする */
export function occupationLabel(id: string | null, other: string): string {
  if (id === "other") return other.trim() || "(職種の指定なし)";
  return ALL.find((o) => o.id === id)?.label ?? "(職種の指定なし)";
}

export function isOccupation(id: string): boolean {
  return ALL.some((o) => o.id === id);
}
