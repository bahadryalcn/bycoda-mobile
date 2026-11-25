import { expect, it } from "vitest";
import { defaultTabPreferences, dockTabState, hasCustomTabLayout, normalizeTabPreferences, setTabHidden, visibleDockTabs } from "./tab-preferences";

const routes = ["index", "chats", "inbox", "manage", "settings"].map((name) => ({ key: `${name}-k`, name }));

it("normalizes unknown and duplicate ids and drops the retired stored order", () => {
  expect(normalizeTabPreferences(null)).toEqual(defaultTabPreferences);
  expect(normalizeTabPreferences({ order: ["manage", "x", "manage", "index"], hidden: ["settings", "inbox", "inbox"] })).toEqual({
    hidden: ["inbox"],
  });
});

it("keeps one tab visible even when a stored value hides them all", () => {
  expect(visibleDockTabs(normalizeTabPreferences({ hidden: ["index", "chats", "inbox", "manage"] }))).toEqual(["index"]);
});

it("hides and shows tabs", () => {
  const hidden = setTabHidden(defaultTabPreferences, "chats", true);
  expect(hidden.hidden).toEqual(["chats"]);
  expect(setTabHidden(hidden, "chats", false).hidden).toEqual([]);
});

it("only offers showing all tabs when a tab is hidden", () => {
  expect(hasCustomTabLayout(defaultTabPreferences)).toBe(false);
  expect(hasCustomTabLayout(setTabHidden(defaultTabPreferences, "chats", true))).toBe(true);
});

it("keeps the fixed dock order, always keeps settings and tracks the focused route", () => {
  const prefs = { hidden: ["index" as const] };
  const state = dockTabState({ index: 1, routes }, prefs);
  expect(state.routes.map((route) => route.name)).toEqual(["chats", "inbox", "manage", "settings"]);
  expect(state.index).toBe(0);
  expect(dockTabState({ index: 0, routes }, prefs).index).toBe(-1);
  expect(dockTabState({ index: 4, routes }, defaultTabPreferences).routes.at(-1)?.name).toBe("settings");
});
