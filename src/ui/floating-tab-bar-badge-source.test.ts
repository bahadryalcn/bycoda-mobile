import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const dock = source("./floating-tab-bar.tsx");
const layout = source("../../app/(tabs)/_layout.tsx");

/** #1124: the compact dock must draw the unread dot, never print the literal word "dot". */
describe("compact dock badge", () => {
  const tabItem = dock.slice(dock.indexOf("function TabItem("), dock.indexOf("export function FloatingTabBar("));

  it("renders badges through the shared TabBadge in both dock item kinds", () => {
    expect(tabItem).toMatch(/<TabBadge badge=\{badge\} top=\{-space\.sm\} end=\{-space\.xs\} \/>/);
    expect(dock.match(/<TabBadge\b/g)).toHaveLength(2);
  });

  it("keeps no second badge pill that prints the raw badge value", () => {
    expect(tabItem).not.toMatch(/\{badge\}\s*<\/Text>/);
    expect(dock.match(/\{badge\}\s*<\/Text>/g)).toHaveLength(1);
  });

  it("hides the visual badge from accessibility and keeps the destination's own state label", () => {
    const badge = dock.slice(dock.indexOf("export function TabBadge("), dock.indexOf("function BarItem("));
    expect(badge.match(/accessible=\{false\}/g)).toHaveLength(2);
    expect(tabItem).toContain("accessibilityLabel={accessibleLabel}");
    expect(layout).toMatch(/tabBarBadge: TAB_BADGE_DOT,\s*tabBarAccessibilityLabel: copy\("Gelen kutusu, yeni öğeler", "Inbox, new items"\)/);
  });
});
