import { describe, expect, it } from "vitest";
import type { HostModelCatalog } from "@/domain/types";
import type { AgentDraft } from "./types";
import { agentModelChoices, selectAgentModel, selectAgentProvider } from "./agent-model-selection";

const catalog: HostModelCatalog = {
  models: {
    codex: [
      { id: "first", name: "First model", harness: "codex", settings: [{ id: "reasoning", label: "Reasoning", kind: "select", value: "medium", options: [{ value: "medium", label: "Medium" }] }] },
      { id: "second", name: "Second model", harness: "codex", settings: [{ id: "reasoning", label: "Reasoning", kind: "select", value: "low", options: [{ value: "low", label: "Low" }] }] },
    ],
    claude: [{ id: "claude-model", name: "Claude", harness: "claude", settings: [{ id: "thinking", label: "Thinking", kind: "toggle", value: "off", options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }] }] }],
  },
  errors: {},
};
const initial: AgentDraft = { harness: "codex", model: "first", modelSettings: { reasoning: "medium", stale: "old" }, providerAccountId: "codex-account", maxRunMinutes: 12, runtimeMode: "supervised" };

describe("agent model selection", () => {
  it("uses the active locale when matching model names and keeps IDs unchanged", () => {
    const local: HostModelCatalog = { models: { codex: [{ id: "exact-ID", name: "ISTANBUL", harness: "codex", settings: [] }] }, errors: {} };
    expect(agentModelChoices(local, "codex", "ıstanbul", "tr")[0]?.value).toBe("exact-ID");
    expect(agentModelChoices(local, "codex", "ıstanbul", "en")).toEqual([]);
  });
  it("resets provider-specific settings and account only on an explicit provider change", () => {
    expect(selectAgentProvider(initial, "codex", catalog)).toBe(initial);
    const next = selectAgentProvider(initial, "claude", catalog);
    expect(next).toMatchObject({ harness: "claude", model: "claude-model", modelSettings: { thinking: "off" }, providerAccountId: undefined, maxRunMinutes: 12, runtimeMode: "supervised" });
    expect(initial.modelSettings).toEqual({ reasoning: "medium", stale: "old" });
    expect(selectAgentProvider(initial, "claude")).toMatchObject({ model: "", modelSettings: {} });
  });

  it("takes actual target defaults instead of carrying settings unsupported by the new model", () => {
    expect(selectAgentModel(initial, "first", catalog)).toBe(initial);
    expect(selectAgentModel(initial, "second", catalog)).toMatchObject({ model: "second", modelSettings: { reasoning: "low" }, providerAccountId: "codex-account" });
    expect(selectAgentModel(initial, "custom/model", catalog)).toMatchObject({ model: "custom/model", modelSettings: {} });
    expect(selectAgentModel(initial, "second")).toMatchObject({ model: "second", modelSettings: {} });
  });

  it("keeps a saved model and its settings across catalogue arrival and failure", () => {
    const saved = { ...initial, model: "private/custom", modelSettings: { customFlag: "enabled" } };
    for (const current of [undefined, catalog, { models: {}, errors: { codex: "unavailable" } } as HostModelCatalog]) {
      expect(agentModelChoices(current, saved.harness, "", "en", saved.model)[0]).toMatchObject({
        value: "private/custom", selected: true,
      });
      expect(selectAgentModel(saved, saved.model, current)).toBe(saved);
      expect(saved.model).toBe("private/custom");
      expect(saved.modelSettings).toEqual({ customFlag: "enabled" });
    }
  });

  it("searches model names and IDs while catalogue filtering never chooses a model", () => {
    expect(agentModelChoices(catalog, "codex", "Second")).toEqual([
      { value: "second", label: "Second model", searchKeywords: "second", selected: false },
    ]);
    expect(agentModelChoices(catalog, "claude", "claude-model")[0].value).toBe("claude-model");
    expect(agentModelChoices(catalog, "codex", "no-match")).toEqual([]);
    expect(initial.model).toBe("first");
  });
});
