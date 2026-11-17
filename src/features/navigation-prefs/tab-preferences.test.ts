import { expect, it } from "vitest";
import { defaultTabPreferences, dockTabState, moveTab, normalizeTabPreferences, setTabHidden } from "./tab-preferences";

const routes = ["index", "chats", "inbox", "manage", "settings"].map((name) => ({ key: `${name}-k`, name }));

it("normalizes unknown, duplicate and missing ids", () => {
  expect(normalizeTabPreferences(null)).toEqual(defaultTabPreferences);
  expect(normalizeTabPreferences({ order: ["manage", "x", "manage", "index"], hidden: ["settings", "inbox", "inbox"] })).toEqual({
    order: ["manage", "index", "chats", "inbox"],
    hidden: ["inbox"],
  });
});

it("moves and hides tabs", () => {
  expect(moveTab(defaultTabPreferences, 0, 2).order).toEqual(["chats", "inbox", "index", "manage"]);
  expect(moveTab(defaultTabPreferences, 0, 9)).toBe(defaultTabPreferences);
  const hidden = setTabHidden(defaultTabPreferences, "chats", true);
  expect(hidden.hidden).toEqual(["chats"]);
  expect(setTabHidden(hidden, "chats", false).hidden).toEqual([]);
});

it("orders the dock, always keeps settings and tracks the focused route", () => {
  const prefs = { order: ["manage", "index", "chats", "inbox"] as ("manage" | "index" | "chats" | "inbox")[], hidden: ["index" as const] };
  const state = dockTabState({ index: 1, routes }, prefs);
  expect(state.routes.map((route) => route.name)).toEqual(["manage", "chats", "inbox", "settings"]);
  expect(state.index).toBe(1);
  expect(dockTabState({ index: 0, routes }, prefs).index).toBe(-1);
  expect(dockTabState({ index: 4, routes }, defaultTabPreferences).routes.at(-1)?.name).toBe("settings");
});
