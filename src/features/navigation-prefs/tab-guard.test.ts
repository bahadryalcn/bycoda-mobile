import { expect, it } from "vitest";
import { isLastVisibleTab, setTabHidden, type TabPreferences } from "./tab-preferences";

const tabs: TabPreferences = { hidden: ["chats", "inbox"] };

it("keeps at least one tab besides Settings visible", () => {
  const one = setTabHidden(tabs, "index", true);
  expect(one.hidden).toEqual(["chats", "inbox", "index"]);
  expect(isLastVisibleTab(one, "manage")).toBe(true);
  expect(setTabHidden(one, "manage", true)).toBe(one);
  expect(setTabHidden(one, "index", false).hidden).toEqual(["chats", "inbox"]);
  expect(isLastVisibleTab(tabs, "index")).toBe(false);
});
