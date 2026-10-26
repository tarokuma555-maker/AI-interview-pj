/** ログインの入力を整える(スマホでの入力のゆれを吸収する。設計 2026-10-27 7章) */

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** 確認コード。全角数字を半角にし、空白・ハイフンを除く。6桁の数字でなければ null */
export function normalizeCode(input: string): string | null {
  const code = input.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/[\s\-‐－ー]/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}
