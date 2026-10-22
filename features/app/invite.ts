/** 招待リンクの「#」より後ろ、またはリンク全体を貼り付けた文字列から、招待のコードを取り出す */
export function extractInviteCode(input: string): string {
  const trimmed = input.trim();
  const hash = trimmed.indexOf("#");
  const code = hash >= 0 ? trimmed.slice(hash + 1) : trimmed;
  try {
    return decodeURIComponent(code).trim();
  } catch {
    return code.trim();
  }
}
