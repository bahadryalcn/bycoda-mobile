import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { componentCatalog } from "./catalog";

describe("shared component catalog", () => {
  it("exposes every installed group, including ChatAI, through the library", () => {
    const installed = readdirSync(new URL("./gluestack", import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(componentCatalog.map((item) => item.id).sort()).toEqual(installed);
    expect(new Set(installed).size).toBe(59);
    const exports = readFileSync(new URL("./library.ts", import.meta.url), "utf8");
    for (const id of installed) expect(exports).toContain(`from "./gluestack/${id}"`);
    expect(installed).toContain("chat-ai");
  });
  it("declares platform limits instead of pretending native APIs are universal", () => {
    expect(componentCatalog.find((item) => item.id === "liquid-glass")?.capability).toBe(
      "ios-glass-with-panel-fallback",
    );
    expect(componentCatalog.find((item) => item.id === "input-accessory-view")?.capability).toBe(
      "ios-only",
    );
  });
});
