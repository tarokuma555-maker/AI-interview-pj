import { describe, expect, it } from "vitest";
import { PLACEHOLDER_AVATAR, STANDARD_AVATAR } from "@/features/avatar/manifest";
import { DEFAULT_AVATAR_SETTINGS, parseAvatarSettings, resolveAvatar } from "@/features/avatar/settings";

const patch = { src: "data:image/jpeg;base64,AA", rect: { x: 400, y: 180, width: 140, height: 160 } };

describe("parseAvatarSettings", () => {
  it("保存がなければ、標準の面接官を使う", () => {
    expect(parseAvatarSettings(null)).toEqual(DEFAULT_AVATAR_SETTINGS);
    expect(resolveAvatar(DEFAULT_AVATAR_SETTINGS)).toBe(STANDARD_AVATAR);
  });

  it("以前の形式で保存した設定も読み込める", () => {
    const settings = parseAvatarSettings({ selected: "placeholder", custom: null });
    expect(settings).toEqual({ selected: "placeholder", custom: null, builtinExpressions: {} });
    expect(resolveAvatar(settings)).toBe(PLACEHOLDER_AVATAR);
  });

  it("壊れた設定や、画像のない「自分で用意した画像」は標準の面接官に戻す", () => {
    expect(parseAvatarSettings({ selected: "unknown" }).selected).toBe("sato");
    expect(parseAvatarSettings({ selected: "custom", custom: { id: "x" } }).selected).toBe("sato");
    expect(parseAvatarSettings("text")).toEqual(DEFAULT_AVATAR_SETTINGS);
  });

  it("用意している顔に追加した表情の画像を重ねる(知らない顔の分は捨てる)", () => {
    const settings = parseAvatarSettings({
      selected: "sato",
      custom: null,
      builtinExpressions: { sato: { mouth: { a: patch } }, someone: { mouth: { a: patch } } },
    });
    expect(Object.keys(settings.builtinExpressions)).toEqual(["sato"]);
    const avatar = resolveAvatar(settings)!;
    expect(avatar.src).toBe(STANDARD_AVATAR.src);
    // 追加した画像はその表情だけを差し替え、ほかの表情は用意してある画像を使う
    expect(avatar.expressions?.mouth?.a).toEqual(patch);
    expect(avatar.expressions?.mouth?.i).toEqual(STANDARD_AVATAR.expressions?.mouth?.i);
    expect(avatar.expressions?.blink).toEqual(STANDARD_AVATAR.expressions?.blink);
  });

  it("「表示しない」なら null", () => {
    expect(resolveAvatar({ ...DEFAULT_AVATAR_SETTINGS, selected: "none" })).toBeNull();
  });
});
