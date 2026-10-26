/** ログインできないときに画面に出す言葉(要件 UX-02。技術的な言葉やエラーの番号は出さない) */

export const INPUT_MESSAGES = {
  email: "メールアドレスを確かめてください",
  code: "メールに書かれた6桁の数字を入れてください",
} as const;

const NOT_REGISTERED = new Set(["otp_disabled", "signup_disabled", "user_not_found"]);
const TOO_MANY = new Set(["over_email_send_rate_limit", "over_request_rate_limit"]);

export function loginErrorMessage(error: { code?: string; status?: number; message?: string }): string {
  if ((error.code && NOT_REGISTERED.has(error.code)) || /signups not allowed/i.test(error.message ?? "")) {
    return "このメールアドレスは登録されていません。管理者にお問い合わせください";
  }
  if (error.status === 429 || (error.code && TOO_MANY.has(error.code))) {
    return "メールを続けて送ることはできません。1分ほど待ってからお試しください";
  }
  if (error.code === "otp_expired") return "確認コードが違うか、期限が切れています。もう一度メールを送ってください";
  return "うまくいきませんでした。時間をおいてもう一度お試しください";
}
