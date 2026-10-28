import { describe, expect, it } from "vitest";
import { catalogModel, catalogProvider, catalogProviders, modelDefaults, sessionCatalog, sessionModel, sessionSettings } from "./catalog";
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

describe("immediate session configuration", () => {
  it("shows bundled Codex and Claude models with reasoning before discovery completes", () => {
    const result = sessionCatalog(undefined, ["codex", "claude"]);
    for (const provider of ["codex", "claude"] as const) {
      const model = sessionModel(result, provider, "");
      expect(model?.name).toBeTruthy();
      expect(model?.settings?.some((setting) => /effort/i.test(setting.id))).toBe(true);
      expect(Object.keys(sessionSettings(model, {})).length).toBeGreaterThan(0);
    }
    expect(sessionCatalog(undefined, ["cursor"]).models.codex).toBeUndefined();
    expect(sessionCatalog(undefined, []).models.claude).toBeUndefined();
  });

  it("lets a nonempty Host catalogue override bundled models and supported options", () => {
    const result = sessionCatalog(catalog, ["codex"]);
    expect(result.models.codex).toEqual(catalog.models.codex);
    expect(sessionSettings(sessionModel(result, "codex", "current"), { effort: "ultra", stale: "yes" })).toEqual({ effort: "high" });
    expect(sessionSettings(sessionModel(result, "codex", "current"), { effort: "high" })).toEqual({ effort: "high" });
  });

  it("does not apply a different model's defaults to custom IDs", () => {
    expect(sessionModel(catalog, "codex", "my-custom-model")).toBeUndefined();
    expect(sessionSettings(undefined, { effort: "high" })).toEqual({});
    const result = sessionCatalog(undefined, ["codex"]);
    const first = result.models.codex![0];
    expect(sessionModel(result, "codex", first.nativeId!)).toBe(first);
  });

  it("retains discovery errors and pending status alongside the bundled choices", () => {
    const result = sessionCatalog({ models: {}, errors: { claude: "Sign in required" }, pending: ["codex"] }, ["claude", "codex"]);
    expect(result.errors.claude).toBe("Sign in required");
    expect(result.pending).toEqual(["codex"]);
    expect(result.models.claude?.length).toBeGreaterThan(0);
  });

  it("fills omitted capabilities only for known models and respects an explicit empty setting list", () => {
    const bundled = sessionCatalog(undefined, ["codex"]).models.codex![0];
    const missing = { ...bundled, settings: undefined };
    const result = sessionCatalog({ models: { codex: [missing] }, errors: {} }, ["codex"]);
    expect(result.models.codex![0].settings).toEqual(bundled.settings);
    const explicit = sessionCatalog({ models: { codex: [{ ...missing, settings: [] }] }, errors: {} }, ["codex"]);
    expect(explicit.models.codex![0].settings).toEqual([]);
    const unknown = sessionCatalog({ models: { codex: [{ ...missing, id: "custom", nativeId: "custom" }] }, errors: {} }, ["codex"]);
    expect(unknown.models.codex![0].settings).toBeUndefined();
  });
});
