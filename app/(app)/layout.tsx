import { redirect } from "next/navigation";

/** 旧共通コード方式の画面は閉じる。端末の保存データは削除しない。/poc は別の管理用画面。 */
export default function RetiredAppLayout() {
  redirect("/");
}
