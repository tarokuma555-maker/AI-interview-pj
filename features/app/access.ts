"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchConfig, type PocConfig } from "@/features/interview/client/poc-api";

/**
 * 招待リンクのコードでサーバーの設定を読む(ログイン機能ができるまでの入口。設計書 14.2)。
 * 同じコードの設定は、ページを開いている間は読み直さない。
 */

export type ConfigState =
  | { status: "loading" }
  | { status: "ready"; config: PocConfig }
  | { status: "invalid" }
  | { status: "error"; message: string };

const cache = new Map<string, Promise<PocConfig>>();

export function loadConfig(code: string): Promise<PocConfig> {
  let pending = cache.get(code);
  if (!pending) {
    pending = fetchConfig(code);
    cache.set(code, pending);
    // 失敗したら覚えず、次はやり直す
    pending.catch(() => cache.delete(code));
  }
  return pending;
}

export function isInvalidCode(error: unknown): boolean {
  return error instanceof ApiError && error.code === "INVALID_CODE";
}

export function useAppConfig(code: string | null): { state: ConfigState; retry: () => void } {
  const [state, setState] = useState<ConfigState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    loadConfig(code)
      .then((config) => !cancelled && setState({ status: "ready", config }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(isInvalidCode(error) ? { status: "invalid" } : { status: "error", message: "サーバーにつながりませんでした。通信の状態を確かめて、もう一度お試しください" });
      });
    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
