/**
 * 面接の進行で出るメッセージを、利用者に分かる言葉にする(要件 UX-02、UX-05)。
 * 「音声認識」「API」などの言葉や、通信エラーの番号は画面に出さない。
 */

/** 準備中の表示(面接の進行のメッセージから) */
export function preparingLabel(message: string | null): string {
  if (!message) return "準備しています…";
  if (message.includes("マイク")) return "マイクを準備しています…";
  if (message.includes("質問")) return "あなたに合わせた質問を用意しています…";
  if (message.includes("音声認識")) return "声の聞き取りを準備しています…";
  return "準備しています…";
}

export type PrepareProblem = { title: string; detail: string; canUseText: boolean };

/** 準備に失敗したときの表示 */
export function prepareProblem(message: string | null, userAgent: string): PrepareProblem {
  const text = message ?? "";
  if (text.includes("マイクの使用が許可されていません") || /NotAllowed|Permission/i.test(text)) {
    return { title: "マイクが使えません", detail: micPermissionHelp(userAgent), canUseText: true };
  }
  if (/NotFound|Requested device not found|マイクが見つから/i.test(text)) {
    return { title: "マイクが見つかりません", detail: "マイク付きのイヤホンをつなぐか、マイクのある端末で開いてください。", canUseText: true };
  }
  if (text.includes("アクセスコード") || text.includes("INVALID_CODE")) {
    return { title: "招待の期限が切れています", detail: "担当のキャリアアドバイザーに、新しい招待リンクをお問い合わせください。", canUseText: false };
  }
  if (text.includes("短時間に多く")) {
    return { title: "少し時間をおいてください", detail: "短い時間に何度も練習を始めたため、一時的に止まっています。1分ほど待ってから、もう一度お試しください。", canUseText: false };
  }
  return { title: "準備がうまくいきませんでした", detail: "通信の状態を確かめて、もう一度お試しください。", canUseText: true };
}

/** 端末ごとの、マイクを許可する方法 */
export function micPermissionHelp(userAgent: string): string {
  if (isInAppBrowser(userAgent)) {
    return "LINE などのアプリの中で開いていると、マイクが使えないことがあります。画面右上のメニューから「ブラウザで開く」を選んで、開き直してください。";
  }
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "iPhone の「設定」→「Safari」→「マイク」で「許可」を選んでから、このページを開き直してください。";
  }
  if (/Android/i.test(userAgent)) {
    return "画面上のアドレスバーの左にある鍵(または設定)のマークを押し、「マイク」を「許可」にしてから、このページを開き直してください。";
  }
  return "アドレスバーの左にある鍵(または設定)のマークを押し、マイクを「許可」にしてから、このページを開き直してください。";
}

/** LINE・Instagram・Facebook などのアプリ内ブラウザ(マイクが使えないことがある。要件 8.6) */
export function isInAppBrowser(userAgent: string): boolean {
  return /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(userAgent);
}

/** 面接中に出るメッセージ */
export function roomMessage(message: string | null): string | null {
  if (!message) return null;
  if (message.includes("聞き取れませんでした") || message.includes("文字にできませんでした")) {
    return "うまく聞き取れませんでした。もう一度お話しください。";
  }
  if (message.includes("マイクの使用が許可されていません")) return "マイクが使えなくなりました。";
  return "通信が不安定です。少し待ってから、もう一度お話しください。";
}

/** 声の聞き取りが使えなくなり、文字の入力に切り替えたときの案内(要件 F-05-12) */
export const STT_FALLBACK_NOTICE = "声の聞き取りがうまくいかないため、文字で答える形に切り替えました。面接はこのまま続きます。";
