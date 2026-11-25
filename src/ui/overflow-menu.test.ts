import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { singleMenuAction } from "./use-menu-lifecycle";

const source = readFileSync(new URL("./overflow-menu.tsx", import.meta.url), "utf8");

describe("action menu selection semantics", () => {
  it("forwards a reserved touch target to its icon trigger", () => {
    expect(source).toContain("reserveTouchTarget={reserveTouchTarget}");
  });
  it("does not spell selection into accessibility labels", () => {
    expect(source).not.toMatch(/copy\("Seçili/);
    expect(source).not.toMatch(/copy\("Selected"|"Not selected"/);
  });

  it("passes selection to native rows as state without tinting the row", () => {
    expect(source).toContain("selected={item.selected}");
    expect(source).toContain("tintSelected={false}");
  });

  it("keeps the web menu item selected state and trailing mark", () => {
    expect(source).toContain("accessibilityState={{ disabled: !!item.disabled, selected: item.selected }}");
    expect(source).toContain("trailing={item.selected ? <Check /> : undefined}");
  });
});

describe("single-action menus", () => {
  it("shows a lone action directly instead of a one-item menu", () => {
    const refresh = { key: "refresh" };
    expect(singleMenuAction([refresh])).toBe(refresh);
    expect(singleMenuAction([refresh, { key: "help" }])).toBeNull();
    expect(singleMenuAction([])).toBeNull();
  });
  it("keeps the menu step for a lone destructive action unless it opens its own review", () => {
    expect(singleMenuAction([{ key: "delete", destructive: true }])).toBeNull();
    const reviewed = { key: "close", destructive: true, reviewed: true };
    expect(singleMenuAction([reviewed])).toBe(reviewed);
  });
  it("renders the lone action in place of the trigger with the same access check", () => {
    expect(source).toContain("const only = singleMenuAction(items);");
    expect(source).toContain("if (!access.allowed || !access.check()) return;");
  });
});
