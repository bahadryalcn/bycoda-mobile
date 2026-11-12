import { describe, expect, it } from "vitest";
import type { HostModelCatalog } from "./wire";
import {
  delegationCandidates, effectiveImages, imageChoices, readDelegation,
  refKey, setAdvisor, setImageModels, setSubagents,
} from "./delegation-model";

const catalog = {
  accounts: { codex: [{ id: "default", label: "Default" }], claude: [{ id: "default", label: "Personal" }, { id: "w", label: "Work", color: "#fff" }] },
  models: {
    codex: [{ id: "gpt", name: "GPT", harness: "codex", settings: [] }],
    claude: [{ id: "claude:sonnet", name: "Sonnet", harness: "claude", settings: [] }],
    grok: [{ id: "g1", name: "Grok", harness: "grok", settings: [] }],
  },
  errors: {},
} as unknown as HostModelCatalog;

describe("delegation candidates", () => {
  const list = delegationCandidates(catalog, ["codex", "claude", "grok"]);
  it("expands accounts for Claude and Codex only, labelled Model · Account", () => {
    expect(list.map((item) => item.label)).toEqual(["GPT · Default", "Sonnet · Personal", "Sonnet · Work", "Grok"]);
    expect(list[2]!.ref).toEqual({ harness: "claude", model: "claude:sonnet", providerAccountId: "w" });
    expect(list[3]!.ref).toEqual({ harness: "grok", model: "g1" });
  });
  it("treats an omitted account as the default login", () => {
    expect(refKey({ harness: "codex", model: "gpt" })).toBe(refKey({ harness: "codex", model: "gpt", providerAccountId: "default" }));
  });
  it("skips providers that are not connected", () => {
    expect(delegationCandidates(catalog, ["grok"])).toHaveLength(1);
  });
});

describe("advisor and subagents", () => {
  const [gpt, personal, work] = delegationCandidates(catalog, ["codex", "claude"]);
  it("sets and clears the advisor", () => {
    const set = setAdvisor({}, gpt!.ref);
    expect(readDelegation(set).advisor).toEqual(gpt!.ref);
    expect(readDelegation(setAdvisor(set, undefined)).advisor).toBeUndefined();
  });
  it("stores the picked list and clears it", () => {
    const settings = setSubagents({}, [personal!.ref, work!.ref]);
    expect(readDelegation(settings).subagents).toEqual([personal!.ref, work!.ref]);
    expect(setSubagents(settings, []).crossSubagents).toBe("");
  });
  it("respects the subagent limit", () => {
    const refs = Array.from({ length: 30 }, (_, index) => ({ harness: "grok" as const, model: `m${index}` }));
    expect(readDelegation(setSubagents({}, refs)).subagents).toHaveLength(24);
  });
});

describe("image models", () => {
  const offered = imageChoices(["codex", "claude"]);
  it("offers only generators of connected providers", () => {
    expect(offered.map((item) => item.id)).toEqual(["codex"]);
    expect(imageChoices(["codex", "antigravity"]).map((item) => item.id)).toEqual(["codex", "antigravity"]);
  });
  it("is automatic until a list is stored", () => {
    expect(effectiveImages({}, offered)).toEqual(["codex"]);
    expect(readDelegation({}).images).toBeUndefined();
  });
  it("an empty list turns images off and picking every model is automatic again", () => {
    const both = imageChoices(["codex", "antigravity"]);
    const off = setImageModels({}, [], both);
    expect(off.imageModels).toBe("[]");
    expect(effectiveImages(off, both)).toEqual([]);
    expect(setImageModels(off, ["codex"], both).imageModels).toBe('["codex"]');
    expect("imageModels" in setImageModels(off, ["codex", "antigravity"], both)).toBe(false);
  });
});
