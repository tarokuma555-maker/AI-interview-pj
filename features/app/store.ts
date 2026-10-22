"use client";

import { useSyncExternalStore } from "react";
import type { FeedbackResult } from "@/features/interview/client/poc-api";
import type { Stage, Style, TurnRecord } from "@/lib/interview/types";

/**
 * 製品版の先行版で、利用者のデータをこのブラウザに保存する(設計書 14.2)。
 * データベースとログイン(開発ステップ3)ができたら、同じ形のデータをサーバーに移す。
 */

export type SpeechRate = "normal" | "slow";
export type AnswerBy = "voice" | "text";

export type Company = {
  id: string;
  name: string;
  position: string;
  jobDescription: string;
  updatedAt: string;
};

/** 利用者が選ぶ面接の設定(要件 D-13。技術的な設定は含めない) */
export type InterviewChoice = {
  /** 応募先(null は応募先を指定しない汎用の面接) */
  companyId: string | null;
  stage: Stage;
  style: Style;
  durationMin: 5 | 15 | 30;
  answerBy: AnswerBy;
};

export type SavedSession = {
  id: string;
  startedAt: string;
  finishedAt: string;
  choice: InterviewChoice;
  /** 練習したときの応募先・ポジション(応募先を消しても履歴に残す) */
  companyName: string;
  position: string;
  history: TurnRecord[];
  feedback: FeedbackResult | null;
};

export type AppData = {
  version: 1;
  /** 招待リンクに含まれるコード(ログイン機能ができるまでの入口) */
  accessCode: string | null;
  /** 同意した日時と、同意した内容の版 */
  consent: { at: string; version: string } | null;
  /** はじめての案内を終えた日時 */
  onboardedAt: string | null;
  profile: {
    /** 職種の id(occupations.ts)。「その他」は occupationOther に書く */
    occupation: string | null;
    occupationOther: string;
    careerSummary: string;
    reasonForChange: string;
  };
  preferences: { speechRate: SpeechRate; captions: boolean; earphones: boolean };
  companies: Company[];
  lastChoice: InterviewChoice | null;
};

export const CONSENT_VERSION = "2026-10-22";
/** このブラウザに残す練習の数(古いものから消す) */
export const MAX_SESSIONS = 30;

const DATA_KEY = "ai-mensetsu:data";
const SESSIONS_KEY = "ai-mensetsu:sessions";
/** 試作版で入力したアクセスコード(同じブラウザなら招待リンクなしで使えるようにする) */
const POC_CODE_KEY = "poc-access-code";

export const EMPTY_DATA: AppData = {
  version: 1,
  accessCode: null,
  consent: null,
  onboardedAt: null,
  profile: { occupation: null, occupationOther: "", careerSummary: "", reasonForChange: "" },
  preferences: { speechRate: "normal", captions: false, earphones: false },
  companies: [],
  lastChoice: null,
};

type State = { data: AppData; sessions: SavedSession[] };

let state: State | null = null;
const listeners = new Set<() => void>();

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 保存されていたデータを、いまの形に合わせて読み込む(足りない項目は初期値で埋める) */
export function parseData(raw: unknown, pocCode: string | null): AppData {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<AppData>;
  return {
    ...EMPTY_DATA,
    ...value,
    version: 1,
    accessCode: typeof value.accessCode === "string" && value.accessCode ? value.accessCode : pocCode,
    profile: { ...EMPTY_DATA.profile, ...value.profile },
    preferences: { ...EMPTY_DATA.preferences, ...value.preferences },
    companies: Array.isArray(value.companies) ? value.companies : [],
  };
}

function load(): State {
  if (!state) {
    const pocCode = readJson<string>(POC_CODE_KEY);
    const sessions = readJson<SavedSession[]>(SESSIONS_KEY);
    state = {
      data: parseData(readJson(DATA_KEY), typeof pocCode === "string" ? pocCode : null),
      sessions: Array.isArray(sessions) ? sessions : [],
    };
  }
  return state;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // 別のタブで変わったら読み込み直す
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DATA_KEY && event.key !== SESSIONS_KEY && event.key !== null) return;
    state = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** 保存しているデータ。サーバーでの描画中と読み込み前は null */
export function useAppData(): AppData | null {
  return useSyncExternalStore(subscribe, () => load().data, () => null);
}

export function useSessions(): SavedSession[] | null {
  return useSyncExternalStore(subscribe, () => load().sessions, () => null);
}

/** データを変えて保存する。保存できなかった場合(容量不足など)は false(画面の表示は変える) */
export function updateAppData(change: (data: AppData) => AppData): boolean {
  const current = load();
  const data = change(current.data);
  state = { ...current, data };
  emit();
  return writeJson(DATA_KEY, data);
}

/** 練習の結果を保存する(新しい順。上限を超えたら古いものから消す) */
export function saveSession(session: SavedSession): boolean {
  const current = load();
  const sessions = [session, ...current.sessions.filter((s) => s.id !== session.id)].slice(0, MAX_SESSIONS);
  state = { ...current, sessions };
  emit();
  // 容量が足りないときは、古いものを減らして保存し直す
  for (let keep = sessions.length; keep > 0; keep = Math.floor(keep / 2)) {
    if (writeJson(SESSIONS_KEY, sessions.slice(0, keep))) return true;
  }
  return false;
}

export function deleteSession(id: string): void {
  const current = load();
  const sessions = current.sessions.filter((s) => s.id !== id);
  state = { ...current, sessions };
  emit();
  writeJson(SESSIONS_KEY, sessions);
}

/** このブラウザに保存した練習のデータをすべて消す(招待のコードは残す) */
export function clearAllData(): void {
  const accessCode = load().data.accessCode;
  try {
    localStorage.removeItem(SESSIONS_KEY);
  } catch {
    // 消せなくても画面の表示は消す
  }
  state = { data: { ...EMPTY_DATA, accessCode }, sessions: [] };
  writeJson(DATA_KEY, state.data);
  emit();
}

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
