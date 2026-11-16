// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useMobileTheme } from "./theme";
import { createThemedStyles, useThemedStyles } from "./themed-styles";
import { applyMobileTheme, colors, resolveMobilePalette, themePalettes } from "./tokens";
import { applyTypography } from "./typography-runtime";
import { DEFAULT_TYPOGRAPHY } from "./typography-preferences";

vi.mock("./styles", async () => {
  const { createThemedStyles } = await import("./themed-styles");
  const { colors } = await import("./tokens");
  return { uiStyles: createThemedStyles(() => ({ screen: { backgroundColor: colors.background } })) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { applyMobileTheme("dark", "classic"); applyTypography(DEFAULT_TYPOGRAPHY); });

const extra = createThemedStyles(() => ({ label: { color: colors.text } }));
const textSheet = createThemedStyles(() => ({ body: { fontSize: 15, lineHeight: 20 } }));

it("updates mounted text and theme identities without remounting the reader", async () => {
  let mounts = 0;
  let previous: unknown;
  function Reader() {
    const theme = useMobileTheme();
    const styles = useThemedStyles(textSheet);
    const [draft] = useState(() => { mounts++; return "unsent draft"; });
    previous = theme;
    return createElement("div", { "data-size": styles.body.fontSize }, draft);
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(createElement(Reader)));
  const initialTheme = previous;
  await act(async () => applyTypography({ ...DEFAULT_TYPOGRAPHY, scale: 1.2 }));
  expect(container.firstElementChild?.getAttribute("data-size")).toBe("18");
  expect(container.textContent).toBe("unsent draft");
  expect(mounts).toBe(1);
  expect(previous).not.toBe(initialTheme);
  await act(async () => root.unmount());
});

function Probe() {
  const { colors, uiStyles } = useMobileTheme();
  const sheet = useThemedStyles(extra);
  return createElement("div", { id: "probe", "data-bg": colors.background, "data-screen": String(uiStyles.screen.backgroundColor), "data-label": String(sheet.label.color) });
}

it("re-renders mounted components with the new palette and per-mode style objects", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(createElement(Probe)));
  const probe = () => host.querySelector("#probe")!;
  expect(probe().getAttribute("data-bg")).toBe(themePalettes.dark.background);
  expect(probe().getAttribute("data-screen")).toBe(themePalettes.dark.background);
  await act(async () => applyMobileTheme("light"));
  expect(probe().getAttribute("data-bg")).toBe(themePalettes.light.background);
  expect(probe().getAttribute("data-screen")).toBe(themePalettes.light.background);
  expect(probe().getAttribute("data-label")).toBe(themePalettes.light.text);
  await act(async () => root.unmount());
});

it("changes the hook result identity with the mode and keeps it stable within one", async () => {
  const seen: unknown[] = [];
  function Capture() {
    seen.push(useMobileTheme());
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Capture)));
  await act(async () => root.render(createElement(Capture)));
  await act(async () => applyMobileTheme("light"));
  expect(seen[1]).toBe(seen[0]);
  expect(seen.at(-1)).not.toBe(seen[0]);
  expect((seen.at(-1) as { colors: unknown }).colors).toBe(themePalettes.light);
  await act(async () => root.unmount());
});

it("recolours mounted components when only the palette changes", async () => {
  const seen: { colors: { background: string }; palette: string }[] = [];
  function Capture() {
    seen.push(useMobileTheme());
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Capture)));
  await act(async () => applyMobileTheme("dark", "olive"));
  await act(async () => applyMobileTheme("dark", "olive"));
  const olive = seen.at(-1)!;
  expect(olive.palette).toBe("olive");
  expect(olive.colors).toBe(resolveMobilePalette("olive", "dark").colors);
  expect(olive.colors.background).not.toBe(themePalettes.dark.background);
  expect(colors.background).toBe(olive.colors.background);
  await act(async () => applyMobileTheme("light", "olive"));
  expect(seen.at(-1)!.colors).toBe(resolveMobilePalette("olive", "light").colors);
  await act(async () => root.unmount());
});
