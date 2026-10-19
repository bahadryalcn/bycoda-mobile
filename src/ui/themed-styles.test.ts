import { afterEach, describe, expect, it, vi } from "vitest";
import { createThemedStyles } from "./themed-styles";
import { applyMobileTheme, colors, getMobileThemeMode, semanticColors, subscribeMobileTheme, themePalettes } from "./tokens";

afterEach(() => applyMobileTheme("dark"));

describe("native theme changes", () => {
  it("updates native styles and inline semantic colors without retaining the startup palette", () => {
    applyMobileTheme("dark");
    const factory = vi.fn(() => ({ panel: { backgroundColor: colors.panel, color: colors.text }, error: { color: semanticColors.danger.text } }));
    const styles = createThemedStyles(factory);
    const darkPanel = styles.panel;
    expect(darkPanel.backgroundColor).toBe(themePalettes.dark.panel);
    applyMobileTheme("light");
    expect(styles.panel.backgroundColor).toBe(themePalettes.light.panel);
    expect(styles.error.color).toBe(themePalettes.light.danger);
    expect(colors.text).toBe(themePalettes.light.text);
    expect(styles.panel).not.toBe(darkPanel);
    applyMobileTheme("dark");
    expect(styles.panel).toBe(darkPanel);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("notifies subscribed renderers once per actual change and removes subscriptions", () => {
    applyMobileTheme("dark");
    const listener = vi.fn();
    const unsubscribe = subscribeMobileTheme(listener);
    applyMobileTheme("light");
    applyMobileTheme("light");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getMobileThemeMode()).toBe("light");
    unsubscribe();
    applyMobileTheme("dark");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
