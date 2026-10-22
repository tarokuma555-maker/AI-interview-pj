/**
 * 面接中に画面の上のリンク(ホーム・困ったとき)を押したとき、面接が途中で終わってしまうことを確認する。
 * ページを閉じる場合はブラウザの確認(beforeunload)に任せる。
 */
let message: string | null = null;

export function setLeaveGuard(next: string | null): void {
  message = next;
}

/** リンクを押したときに呼ぶ。移動をやめる場合は false */
export function confirmLeave(): boolean {
  return message === null || window.confirm(message);
}
