// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TerminalModifiers } from "./terminal-keys";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  ScrollView: ({ children, horizontal, accessibilityLabel, keyboardShouldPersistTaps, showsHorizontalScrollIndicator }: PropsWithChildren<{
    horizontal?: boolean; accessibilityLabel?: string; keyboardShouldPersistTaps?: string; showsHorizontalScrollIndicator?: boolean;
  }>) => createElement("div", {
    "aria-label": accessibilityLabel, "data-horizontal": horizontal, "data-persist-taps": keyboardShouldPersistTaps,
    "data-indicator": String(showsHorizontalScrollIndicator),
  }, children),
}));
vi.mock("panelui-native/components/scroll-fade", () => ({
  ScrollFade: ({ children, edges }: PropsWithChildren<{ edges: string }>) => createElement("div", { "data-fade": edges }, children),
}));
vi.mock("lucide-react-native/icons/clipboard-paste", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard-off", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { background: "bg", text: "fg", muted: "muted", accent: "accent" } }) }));
vi.mock("@/ui/tokens", () => ({ iconSize: { action: 20 }, radii: { pill: 999 }, space: { xs: 4, xl: 20 } }));
vi.mock("@/ui/primitives", () => {
  const button = ({ label, accessibilityLabel, selected, disabled, reserveTouchTarget, onPress }: {
    label: string; accessibilityLabel?: string; selected?: boolean; disabled?: boolean; reserveTouchTarget?: boolean; onPress: () => void;
  }) => createElement("button", {
    "aria-label": accessibilityLabel ?? label, "aria-pressed": selected, disabled, "data-touch-target": reserveTouchTarget, onClick: onPress,
  }, label);
  return { Button: button, IconButton: button };
});
import { TerminalKeyBar } from "./terminal-key-bar";

let root: ReturnType<typeof createRoot>, node: HTMLDivElement;
const pressed: string[] = [];
const handlers = {
  onKey: (key: string) => pressed.push(key),
  onToggleModifier: (modifier: string) => pressed.push(`toggle:${modifier}`),
  onPaste: () => pressed.push("paste"),
  onToggleKeyboard: () => pressed.push("keyboard"),
};
const render = (modifiers: TerminalModifiers, disabled = false) => act(async () => root.render(createElement(TerminalKeyBar, {
  disabled, modifiers, keyboardVisible: true, ...handlers,
})));
const button = (label: string) => [...node.querySelectorAll("button")].find((entry) => entry.textContent === label)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pressed.length = 0;
  node = document.createElement("div"); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.unstubAllGlobals(); });

it("scrolls the key caps under an edge fade and pins paste and the keyboard toggle outside the scroller", async () => {
  await render({ ctrl: false, alt: false });
  const row = node.querySelector<HTMLElement>('[aria-label="Terminal keys"]')!;
  expect(row.dataset).toMatchObject({ horizontal: "true", persistTaps: "always", indicator: "false" });
  expect(row.parentElement?.dataset.fade).toBe("both");
  expect([...row.querySelectorAll("button")].map((key) => key.textContent))
    .toEqual(["↑", "↓", "←", "→", "esc", "CTRL", "ALT", "tab", "CLEAR", "~", "|", "/", "-"]);
  const pinned = [...node.querySelectorAll("button")].filter((entry) => !row.contains(entry));
  expect(pinned.map((entry) => entry.getAttribute("aria-label"))).toEqual(["Paste from clipboard", "Hide keyboard"]);
  expect([...node.querySelectorAll("button")].every((entry) => entry.dataset.touchTarget === "true")).toBe(true);
  expect(button("↑").getAttribute("aria-label")).toBe("Arrow up");
  expect(button("CLEAR").getAttribute("aria-label")).toBe("Clear screen (Ctrl-L)");
});

it("sends keys and modifier toggles, and highlights only the armed modifier", async () => {
  await render({ ctrl: false, alt: false });
  expect(button("CTRL").getAttribute("aria-pressed")).toBe("false");
  for (const label of ["CTRL", "ALT", "↑", "tab", "CLEAR", "|", "-"]) await act(async () => button(label).click());
  await act(async () => node.querySelector<HTMLButtonElement>('[aria-label="Paste from clipboard"]')!.click());
  await act(async () => node.querySelector<HTMLButtonElement>('[aria-label="Hide keyboard"]')!.click());
  expect(pressed).toEqual(["toggle:ctrl", "toggle:alt", "up", "tab", "clear", "pipe", "dash", "paste", "keyboard"]);
  await render({ ctrl: true, alt: false });
  expect(button("CTRL").getAttribute("aria-pressed")).toBe("true");
  expect(button("CTRL").getAttribute("aria-label")).toBe("Ctrl on: the next key is sent as a control character");
  expect(button("ALT").getAttribute("aria-pressed")).toBe("false");
  await render({ ctrl: false, alt: true });
  expect(button("ALT").getAttribute("aria-label")).toBe("Alt on: the next key is sent with Alt");
  expect(button("CTRL").getAttribute("aria-pressed")).toBe("false");
});

it("disables the keys while the terminal cannot take input but keeps hiding the keyboard", async () => {
  await render({ ctrl: false, alt: false }, true);
  expect(button("esc").disabled).toBe(true);
  expect(node.querySelector<HTMLButtonElement>('[aria-label="Paste from clipboard"]')!.disabled).toBe(true);
  expect(node.querySelector<HTMLButtonElement>('[aria-label="Hide keyboard"]')!.disabled).toBe(false);
});
