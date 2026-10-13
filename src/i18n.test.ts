import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ language: "system", locales: [{ languageTag: "de-AT" }] }));
vi.mock("expo-localization", () => ({
  getLocales: () => state.locales,
  useLocales: () => state.locales,
}));
vi.mock("./state/machines", () => ({
  useMachines: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
    getState: () => state,
  }),
}));
import { tr, useLocale } from "./i18n";
import { useCopy } from "./ui/copy";
describe("mobile copy adapters", () => {
  beforeEach(() => {
    state.language = "system";
    state.locales = [{ languageTag: "de-AT" }];
  });
  it("routes both copy conventions through the chosen catalog", () => {
    expect(useCopy()("Ayarlar", "Settings")).toBe("Einstellungen");
    expect(tr("Settings", "Ayarlar")).toBe("Einstellungen");
    state.language = "tr";
    expect(useCopy()("Ayarlar", "Settings")).toBe("Ayarlar");
    state.language = "fr";
    expect(useLocale()).toBe("fr");
    expect(useCopy()("Ayarlar", "Settings")).toBe("Paramètres");
  });
  it("reads changed system locales while preserving an explicit choice", () => {
    state.locales = [{ languageTag: "ja-JP" }];
    expect(useLocale()).toBe("ja");
    expect(useCopy()("Ayarlar", "Settings")).toBe("設定");
    state.language = "en";
    expect(useCopy()("Ayarlar", "Settings")).toBe("Settings");
  });
});
