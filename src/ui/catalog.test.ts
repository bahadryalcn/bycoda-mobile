import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { componentCatalog } from "./catalog";

describe("shared component catalog", () => {
  it("indexes every installed PanelUI module", () => {
    const installed = readdirSync(new URL("../../node_modules/panelui-native/src/components", import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(componentCatalog.map((item) => item.id).sort()).toEqual(installed);
    expect(new Set(installed).size).toBe(143);
    expect(installed).toContain("ai-input");
    expect(installed).toContain("attachment");
    expect(componentCatalog.filter((item) => item.priority === "core").map((item) => item.id)).toEqual(expect.arrayContaining(["ai-input", "message", "attachment", "bottom-sheet", "input", "tabs"]));
  });
  it("declares platform limits instead of pretending native APIs are universal", () => {
    expect(componentCatalog.find((item) => item.id === "map")?.capability).toBe(
      "optional-native-map",
    );
    expect(componentCatalog.find((item) => item.id === "support")?.capability).toBe(
      "requires-explicit-service-setup",
    );
  });
});
