// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const screen = vi.hoisted(() => ({ fontScale: 1 }));
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: screen.fontScale }),
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  Pressable: ({ children }: PropsWithChildren) => createElement("button", null, children),
}));
vi.mock("./typography", () => ({
  Body: ({ children, numberOfLines, selectable }: PropsWithChildren<{ numberOfLines?: number; selectable?: boolean }>) =>
    createElement("span", { "data-lines": numberOfLines ?? "unlimited", "data-selectable": String(selectable) }, children),
}));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({ colors: {}, semanticColors: {}, pressedFill: "#000", uiStyles: { press: {}, grow: {}, label: {}, caption: {} } }),
}));
vi.mock("panelui-native/primitives/animated-pressable", () => ({ AnimatedPressable: ({ children }: PropsWithChildren) => createElement("button", null, children) }));
vi.mock("panelui-native/components/separator", () => ({ Separator: () => null }));
vi.mock("./busy-indicator", () => ({ BusyIndicator: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));

import { NavigationRow } from "./navigation-row";

afterEach(() => { document.body.innerHTML = ""; screen.fontScale = 1; });

async function renderRow(props: Partial<Parameters<typeof NavigationRow>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  await act(async () => createRoot(host).render(createElement(NavigationRow, {
    label: "bycoda account", detail: "Optional sign-in, devices and active time", metadata: "Updated today", onPress: () => undefined, ...props,
  })));
  return host;
}

function spanFor(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("span")].find((node) => node.textContent === text);
}

async function linesFor(text: string) {
  return spanFor(await renderRow(), text)?.getAttribute("data-lines");
}

it("keeps compact detail and metadata limits at the default text size", async () => {
  expect(await linesFor("Optional sign-in, devices and active time")).toBe("1");
  expect(await linesFor("Updated today")).toBe("2");
});

it("keeps the label non-selectable so it cannot claim long-press from the pressable row", async () => {
  const host = await renderRow({ labelLines: 2 });
  expect(spanFor(host, "bycoda account")?.getAttribute("data-selectable")).toBe("false");
  expect(spanFor(host, "bycoda account")?.getAttribute("data-lines")).toBe("2");
});

it("keeps explicit detail selection while the label stays non-selectable", async () => {
  const host = await renderRow({ detailSelectable: true });
  expect(spanFor(host, "Optional sign-in, devices and active time")?.getAttribute("data-selectable")).toBe("true");
  expect(spanFor(host, "bycoda account")?.getAttribute("data-selectable")).toBe("false");
});

it("lets detail and metadata wrap when system text is enlarged instead of clipping them", async () => {
  screen.fontScale = 1.5;
  expect(await linesFor("Optional sign-in, devices and active time")).toBe("unlimited");
  expect(await linesFor("Updated today")).toBe("unlimited");
});
