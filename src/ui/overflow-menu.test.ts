import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
