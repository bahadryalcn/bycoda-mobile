import { describe, expect, it } from "vitest";
import { catalogModel, catalogProvider, catalogProviders, modelDefaults } from "./catalog";
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
  errors: { cursor: "Sign in required" },
};

describe("host model selection", () => {
  it("starts on an available provider while preserving an explicit unavailable choice", () => {
    expect(catalogProvider(["claude", "codex"], catalog)).toBe("codex");
    expect(catalogProvider(["claude", "codex"], catalog, "claude")).toBe("claude");
    expect(catalogProvider([], catalog)).toBeUndefined();
    expect(catalogProvider(["codex"], catalog, "cursor")).toBe("codex");
  });
  it("infers provider choices from the real catalog when an older connection has no descriptor", () => {
    expect(catalogProviders(undefined, catalog)).toEqual(["codex", "claude", "cursor"]);
    expect(catalogProviders([], catalog)).toEqual(["codex", "claude", "cursor"]);
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


it("keeps advertised pending discovery providers available before their model result arrives", () => {
  expect(catalogProviders(undefined, { models: {}, errors: {}, pending: ["codex"] })).toEqual(["codex"]);
});
