import { avatarManifestSchema, PLACEHOLDER_AVATAR, STANDARD_AVATAR, type AvatarManifest } from "./manifest";

/**
 * 試作版の設定画面で選ぶアバター(このブラウザに保存する。設計書 3.12)。
 */

/** 用意している顔 */
export const BUILTINS = { sato: STANDARD_AVATAR, placeholder: PLACEHOLDER_AVATAR } as const;
export type BuiltinId = keyof typeof BUILTINS;
type Expressions = AvatarManifest["expressions"];

/** アバターの設定(このブラウザに保存する) */
export type AvatarSettings = {
  selected: BuiltinId | "custom" | "none";
  /** 自分で用意した画像。画像はサーバーに送らず、このブラウザの中だけで使う */
  custom: AvatarManifest | null;
  /** 用意している顔に、このブラウザで追加した表情の画像 */
  builtinExpressions: Partial<Record<BuiltinId, Expressions>>;
};

export const DEFAULT_AVATAR_SETTINGS: AvatarSettings = { selected: "sato", custom: null, builtinExpressions: {} };

export const isBuiltin = (value: unknown): value is BuiltinId => typeof value === "string" && value in BUILTINS;

export function parseAvatarSettings(raw: unknown): AvatarSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_AVATAR_SETTINGS;
  const value = raw as Partial<AvatarSettings>;
  const custom = avatarManifestSchema.safeParse(value.custom);
  const builtinExpressions: AvatarSettings["builtinExpressions"] = {};
  for (const [id, expressions] of Object.entries(value.builtinExpressions ?? {})) {
    const parsed = avatarManifestSchema.shape.expressions.safeParse(expressions);
    if (isBuiltin(id) && parsed.success) builtinExpressions[id] = parsed.data;
  }
  const wanted = value.selected;
  const selected = isBuiltin(wanted) || wanted === "none" || (wanted === "custom" && custom.success) ? wanted : DEFAULT_AVATAR_SETTINGS.selected;
  return { selected, custom: custom.success ? custom.data : null, builtinExpressions };
}

/** 面接で表示するアバター(表示しない場合は null) */
export function resolveAvatar(settings: AvatarSettings): AvatarManifest | null {
  if (settings.selected === "none") return null;
  if (settings.selected === "custom") return settings.custom ?? STANDARD_AVATAR;
  const builtin = BUILTINS[settings.selected];
  const added = settings.builtinExpressions[settings.selected];
  if (!added) return builtin;
  return {
    ...builtin,
    expressions: {
      mouth: { ...builtin.expressions?.mouth, ...added.mouth },
      blink: added.blink ?? builtin.expressions?.blink,
    },
  };
}

