// @vitest-environment happy-dom
import { act, createElement as h, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ComposerSuggestions } from "./composer-suggestions";
import type { ComposerSuggestion } from "./use-composer-catalog";

const commands = vi.hoisted(() => new Map<string, { enabled: boolean; run: () => void }>());
vi.mock("../../../modules/bycoda-key-commands", () => ({
  useKeyCommand: ({ key, enabled }: { key: string; enabled: boolean }, run: () => void) => commands.set(key, { enabled, run }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/primitives", () => ({
  Body: () => null, Button: () => null, ErrorText: () => null, Loading: () => null,
  Row: ({ children }: { children: ReactNode }) => h("div", null, children),
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ fontScale: 1 }),
  View: ({ children }: { children: ReactNode }) => h("div", null, children),
  FlatList: () => null,
}));
vi.mock("panelui-native/components/item", () => ({ Item: () => null }));

let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  commands.clear();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const file: ComposerSuggestion = { id: "file", name: "readme.md", label: "readme.md", detail: "", kind: "file", path: "readme.md" };
const press = (key: string) => {
  const command = commands.get(key);
  if (command?.enabled) command.run();
};
const render = (items: ComposerSuggestion[], onPick = vi.fn(), onClose = vi.fn()) => act(async () => root.render(h(ComposerSuggestions, {
  items, onPick, onClose, keyboardActive: true, maximumHeight: 200, compact: false,
  trigger: "@", selected: -1, loading: false, error: null, onRetry: () => {},
})));

it("keeps Enter in the editor until a suggestion is highlighted", async () => {
  const onPick = vi.fn();
  await render([file], onPick);
  expect(commands.get("Enter")?.enabled).toBe(false);
  expect(commands.get("Tab")?.enabled).toBe(true);
  await act(async () => press("ArrowDown"));
  expect(commands.get("Enter")?.enabled).toBe(true);
  await act(async () => press("Enter"));
  expect(onPick).toHaveBeenCalledExactlyOnceWith(file);
});

it("leaves cursor keys to the editor when there are no matches and keeps Escape available", async () => {
  const onClose = vi.fn();
  await render([], vi.fn(), onClose);
  expect(commands.get("ArrowUp")?.enabled).toBe(false);
  expect(commands.get("ArrowDown")?.enabled).toBe(false);
  expect(commands.get("Tab")?.enabled).toBe(false);
  await act(async () => press("Escape"));
  expect(onClose).toHaveBeenCalledOnce();
});
