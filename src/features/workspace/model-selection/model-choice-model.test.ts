import { describe, expect, it } from "vitest";
import type { ModelRoutingEntry, ModelRoutingState } from "../../../../../src/shared/model/host-contracts/model-routing";
import type { HostModelCatalog } from "../wire";
import {
  choiceEntries,
  choiceForGroup,
  choiceForMode,
  choiceMode,
  entrySettings,
  groupValue,
  targetLabel,
} from "./model-choice-model";
import { chooseFixedModel, chooseFixedProvider, fixedModelChoices } from "./fixed-model";

const entry = (id: string, extra: Partial<ModelRoutingEntry> = {}): ModelRoutingEntry =>
  ({ id, harness: "claude", model: `claude:${id}`, modelSettings: {}, unknownLimit: "use", ...extra });
const state: ModelRoutingState = {
  version: 7,
  updatedAt: 1,
  entries: [entry("a"), entry("b", { providerAccountId: "work" }), entry("c", { harness: "codex", model: "gpt" })],
  pools: [
    { id: "fast", name: "Fast", entryIds: ["c"] },
    { id: "all", name: "All", entryIds: ["a"], poolIds: ["fast"] },
  ],
  roles: { steward: { kind: "pool", poolId: "fast" } },
  delegation: { global: {}, providers: {}, accounts: {} },
  workCaps: { reservePercent: 10 } as never,
};

describe("model choice", () => {
  it("reads a missing choice as fixed and keeps it missing when Fixed is picked again", () => {
    expect(choiceMode(undefined)).toBe("fixed");
    expect(choiceForMode("fixed", undefined)).toBeUndefined();
    expect(choiceForMode("fixed", { kind: "order" })).toEqual({ kind: "fixed" });
    expect(choiceMode({ kind: "pool", poolId: "x" })).toBe("any");
    // Re-picking "Any model" keeps the chosen group.
    expect(choiceForMode("any", { kind: "pool", poolId: "x" })).toEqual({ kind: "pool", poolId: "x" });
    expect(choiceForMode("any", undefined)).toEqual({ kind: "order" });
    expect(choiceForMode("default", { kind: "fixed" })).toEqual({ kind: "default" });
  });

  it("maps the group select to order or pool", () => {
    expect(groupValue({ kind: "pool", poolId: "fast" })).toBe("fast");
    expect(groupValue({ kind: "order" })).toBe("");
    expect(choiceForGroup("")).toEqual({ kind: "order" });
    expect(choiceForGroup("fast")).toEqual({ kind: "pool", poolId: "fast" });
  });

  it("lists the models an order or a group walks, groups flattened like the Host", () => {
    expect(choiceEntries(state, { kind: "order" })?.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(choiceEntries(state, { kind: "pool", poolId: "all" })?.map((row) => row.id)).toEqual(["a", "c"]);
    expect(choiceEntries(state, { kind: "fixed" })).toBeUndefined();
  });
});

describe("model routing labels", () => {
  it("keeps delegation keys out of entry settings", () => {
    expect(entrySettings({ crossAdvisor: "x", effort: "low" })).toEqual({ effort: "low" });
  });

  it("names entries from the catalog with the readable account", () => {
    const catalog = {
      models: { claude: [{ id: "claude:a", name: "Opus 5.5", harness: "claude" }] },
      accounts: { claude: [{ id: "default", label: "Host default" }, { id: "work", label: "Work" }] },
      errors: {},
    } as unknown as HostModelCatalog;
    expect(targetLabel(state.entries[0]!, catalog, "Default account")).toEqual({ name: "Opus 5.5", detail: "Claude · Default account" });
    expect(targetLabel(state.entries[1]!, catalog, "Default account")).toEqual({ name: "b", detail: "Claude · Work" });
    expect(targetLabel(state.entries[2]!, catalog, "Default account")).toEqual({ name: "gpt", detail: "Codex" });
  });
});

describe("fixed model", () => {
  const catalog = {
    models: {
      claude: [{ id: "opus", name: "Opus", harness: "claude", settings: [{ id: "effort", label: "Effort", kind: "select", value: "high", options: [] }] }],
      codex: [{ id: "gpt", name: "GPT", harness: "codex", settings: [] }],
    },
    accounts: { claude: [{ id: "default", label: "Host default" }, { id: "work", label: "Work" }] },
    errors: {},
  } as unknown as HostModelCatalog;
  const value = { harness: "claude" as const, model: "opus", modelSettings: { effort: "low" }, title: "kept" };

  it("offers every provider account and keeps a removed account visible", () => {
    const picked = fixedModelChoices(value, ["codex", "claude"], catalog, "Default account", "Account unavailable");
    expect(picked.choices.map((choice) => choice.key)).toEqual(["claude:", "claude:work", "codex:"]);
    expect(picked.choice?.key).toBe("claude:");
    const gone = fixedModelChoices({ ...value, providerAccountId: "gone" }, ["claude"], catalog, "Default account", "Account unavailable");
    expect(gone.unavailableAccount).toBe(true);
    expect(gone.choice).toMatchObject({ key: "claude:gone", label: "Account unavailable" });
  });

  it("changes only model fields and starts a new provider on its first model", () => {
    const [, work, codex] = fixedModelChoices(value, ["claude", "codex"], catalog, "D", "U").choices;
    expect(chooseFixedProvider(value, work!, catalog)).toEqual({ ...value, providerAccountId: "work" });
    expect(chooseFixedProvider(value, codex!, catalog)).toEqual({ ...value, harness: "codex", providerAccountId: undefined, model: "gpt", modelSettings: {} });
    expect(chooseFixedModel(value, work!, "opus", { effort: "low" })).toEqual({ ...value, providerAccountId: "work" });
  });
});
