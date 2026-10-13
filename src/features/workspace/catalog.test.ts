import { describe, expect, it } from "vitest";
import { catalogModel, catalogProviders, modelDefaults } from "./catalog";
import type { HostModelCatalog } from "./wire";

const catalog: HostModelCatalog = {
  models: {
    codex: [
      {
        id: "current",
        name: "Current",
        harness: "codex",
        settings: [
          {
            id: "effort",
            label: "Effort",
            kind: "select",
            value: "high",
            options: [{ value: "high", label: "High" }],
          },
        ],
      },
    ],
    claude: [],
  },
  errors: { gemini: "Sign in required" },
};

describe("host model selection", () => {
  it("infers provider choices from the real catalog when an older connection has no descriptor", () => {
    expect(catalogProviders(undefined, catalog)).toEqual(["codex", "claude", "gemini"]);
    expect(catalogProviders([], catalog)).toEqual(["codex", "claude", "gemini"]);
    expect(catalogProviders(undefined, undefined)).toEqual([]);
  });

  it("respects a populated descriptor instead of offering unrelated provider models", () => {
    expect(catalogProviders(["claude", "claude"], catalog)).toEqual(["claude"]);
  });

  it("falls back from a removed model and carries provider-supplied defaults", () => {
    expect(catalogModel(catalog, "codex", "removed")?.id).toBe("current");
    expect(modelDefaults(catalogModel(catalog, "codex", "removed"))).toEqual({ effort: "high" });
    expect(catalogModel(catalog, "claude", "current")).toBeUndefined();
  });
});
