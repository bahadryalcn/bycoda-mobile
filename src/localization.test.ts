import { describe, expect, it } from "vitest";
import { LANGUAGES, catalogs, resolveLocale, translate } from "./localization";
import { isLanguagePreference } from "../../src/shared/i18n/languages";

describe("mobile language parity", () => {
  it("translates parity confirmations before substituting model and branch names", () => {
    expect(translate("de", "{p0} yukarı", "Move {p0} up", { p0: "Bluetooth" })).toBe("Bluetooth nach oben verschieben");
    expect(translate("ja", "\"{p0}\" dalı oluşturulup bu dala geçilsin mi?", "Create \"{p0}\" and switch to it?", { p0: "feature" })).toBe("「feature」を作成して切り替えますか？");
    expect(translate("zh-CN", "Paylaşılan içerik taslağa eklenecek ({p0} dosya).", "Shared content will be added to the draft ({p0} files).", { p0: 3 })).toBe("共享内容将添加到草稿（3 个文件）。");
  });
  it("ships a complete offline catalog for every desktop language", () => {
    const keys = Object.keys(catalogs.en).sort();
    for (const { value } of LANGUAGES) {
      expect(Object.keys(catalogs[value]).sort()).toEqual(keys);
      for (const [key, text] of Object.entries(catalogs[value])) {
        expect(text.trim()).not.toBe("");
        expect(text.match(/\{p\d+\}/g)?.sort() ?? []).toEqual(key.match(/\{p\d+\}/g)?.sort() ?? []);
      }
    }
  });
  it.each([
    ["tr-TR", "tr"],
    ["en-GB", "en"],
    ["de-AT", "de"],
    ["fr-CA", "fr"],
    ["es-MX", "es"],
    ["pt_BR", "pt"],
    ["zh-Hans-CN", "zh-CN"],
    ["ja-JP", "ja"],
  ])("resolves system locale %s to %s", (tag, expected) => {
    expect(resolveLocale([tag])).toBe(expected);
  });
  it("uses the next supported system language and falls back to English", () => {
    expect(resolveLocale(["it-IT", "fr-FR"])).toBe("fr");
    expect(resolveLocale(["ar-SA"])).toBe("en");
    expect(resolveLocale([])).toBe("en");
    expect(isLanguagePreference("system")).toBe(true);
    expect(isLanguagePreference("bogus")).toBe(false);
  });
  it("preserves Turkish copy and falls back for new untranslated messages", () => {
    expect(translate("tr", "Özel metin", "New message")).toBe("Özel metin");
    expect(translate("de", "Özel metin", "New message")).toBe("New message");
    expect(translate("de", "Ayarlar", "Settings")).toBe("Einstellungen");
  });
  it("interpolates values after translation without treating their content as placeholders", () => {
    for (const { value } of LANGUAGES) {
      const text = translate(value, "{p0} için yanıt", "Reply to {p0}", { p0: "$& {p1} 日本語" });
      expect(text).toContain("$& {p1} 日本語");
      expect(text).not.toContain("{p0}");
    }
  });
});
