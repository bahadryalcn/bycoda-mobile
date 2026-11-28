import { describe, expect, it } from "vitest";
import type { AgentModel } from "../../../../src/features/sessions/model/models";
import { modelRows, settingsSummary } from "./model-picker-model";
import { inlineSettings, pickerProviders, searchPicker, selectedEntry, settingControl, toggleSides, variantSetting } from "./model-picker-model";
import { carryReasoning, distinctModelCount, entryFor, reasoningChosen, reasoningLabel } from "./model-picker-model";
import { modelDefaults } from "./catalog";
import type { ProviderChoice } from "./provider-choices";
import { filterSelection } from "@/ui/selection-model";

const model = (extra: Partial<AgentModel> = {}): AgentModel => ({ id: "claude:a", harness: "claude", name: "Opus", nativeId: "claude-a", ...extra });

describe("model picker model", () => {
  it("shows the catalog name while matching both model IDs in search", () => {
    const rows = modelRows([model({ contextWindow: 200_000 }), model({ id: "b", name: "Other" })], "claude-a");
    expect(rows[0]).toEqual({ value: "claude:a", label: "Opus", searchKeywords: "claude:a claude-a", selected: true });
    expect(rows[1]?.selected).toBe(false);
    expect(filterSelection(rows, "claude:a")).toEqual([rows[0]]);
    expect(filterSelection(rows, "opus")).toEqual([rows[0]]);
  });
  it("keeps an unknown saved id first", () => {
    const rows = modelRows([model()], "custom");
    expect(rows[0]).toMatchObject({ value: "custom", selected: true });
    expect(rows).toHaveLength(2);
  });
  it("summarizes reasoning and fast", () => {
    const m = model({ settings: [
      { id: "effort", label: "Effort", kind: "select", value: "high", options: [{ value: "high", label: "High" }, { value: "low", label: "Low" }] },
      { id: "fast", label: "Fast", kind: "toggle", value: "off", options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }] },
    ] });
    expect(settingsSummary(m, {}, {})).toBe("High");
    const codex = model({ settings: [
      { id: "effort", label: "Effort", kind: "select", value: "low", options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }] },
      { id: "serviceTier", label: "Service Tier", kind: "select", value: "standard", options: [{ value: "standard", label: "Standard" }, { value: "fast", label: "Fast" }] },
    ] });
    expect(settingsSummary(codex, {}, {})).toBe("Low");
    expect(settingsSummary(codex, { serviceTier: "fast" }, {})).toBe("Low · Fast");
    expect(settingsSummary(m, { fast: "on", effort: "low" }, { Low: "Düşük", Fast: "Hızlı" })).toBe("Düşük · Hızlı");
  });
});

describe("picker providers", () => {
  const choice = (key: string, provider: ProviderChoice["provider"], label: string, accountId?: string): ProviderChoice =>
    ({ key, provider, label, ...(accountId ? { accountId } : {}) });
  const gemini = ["High", "XHigh", "Medium", "Low"].map((effort) =>
    model({ id: `h-${effort.toLowerCase()}`, nativeId: undefined, harness: "antigravity", name: `Gemini 4 Hydrogen (${effort})` }));
  const hermes = [
    model({ id: "auto-opus", nativeId: undefined, harness: "hermes", name: "Auto · anthropic/claude-opus-4.6" }),
    model({ id: "a-opus", nativeId: undefined, harness: "hermes", name: "Anthropic · claude-opus-4-8" }),
    model({ id: "a-fable", nativeId: undefined, harness: "hermes", name: "Anthropic · claude-fable-5-2" }),
  ];
  const claude = [model({ id: "opus", nativeId: undefined, name: "Opus 5.5" }), model({ id: "sonnet", nativeId: undefined, name: "Sonnet 5.5" })];
  const choices = [
    choice("hermes:", "hermes", "Hermes"),
    choice("antigravity:", "antigravity", "Antigravity"),
    choice("claude:", "claude", "Default account"),
    choice("claude:w", "claude", "Work", "w"),
  ];
  const catalog = { claude, hermes, antigravity: gemini };

  it("lists providers in product order with their accounts, and folds effort variants into one row", () => {
    const providers = pickerProviders(choices, choices[1], gemini, "h-low", catalog);
    expect(providers.map((item) => [item.title, item.accounts.map((account) => account.label)])).toEqual([
      ["Claude", ["Default account", "Work"]], ["Antigravity", ["Antigravity"]], ["Hermes", ["Hermes"]],
    ]);
    const antigravity = providers[1]!.accounts[0]!;
    expect(antigravity.own).toBe(true);
    const entry = selectedEntry(antigravity)!;
    expect(antigravity.groups.flatMap((group) => group.entries).map((item) => item.label)).toEqual(["Gemini 4 Hydrogen"]);
    expect(entry.item.model).toBe("h-low");
    expect(variantSetting(entry)).toMatchObject({
      label: "Reasoning",
      value: "h-low",
      options: [
        { value: "h-low", label: "Low" }, { value: "h-medium", label: "Medium" },
        { value: "h-high", label: "High" }, { value: "h-xhigh", label: "Extra High" },
      ],
    });
    expect(settingControl(variantSetting(entry)!)).toBe("slider");
    // A model without variants has no synthetic effort control.
    expect(variantSetting(selectedEntry(pickerProviders(choices, choices[2], claude, "opus", catalog)[0]!.accounts[0]))).toBeUndefined();
  });

  it("keeps effort variants reachable as a Variant control beside a native Reasoning setting", () => {
    const entry = selectedEntry(pickerProviders(choices, choices[1], gemini, "h-low", catalog)[1]!.accounts[0])!;
    const variants = variantSetting(entry, true)!;
    expect(variants).toMatchObject({ id: "variant", label: "Variant", value: "h-low" });
    expect(variants.options.map((option) => option.value)).toEqual(["h-low", "h-medium", "h-high", "h-xhigh"]);
    expect(settingControl(variants)).toBe("select");
  });

  it("shows a family the Host already grouped as one row whose Reasoning setting travels with the model", () => {
    const flash = model({
      id: "antigravity:gemini-3.8-flash", nativeId: "gemini-3.8-flash", harness: "antigravity", name: "Gemini 3.8 Flash",
      settings: [{ id: "effort", label: "Reasoning", kind: "select", value: "high", options: [
        { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
      ] }],
    });
    const providers = pickerProviders(choices, choices[1], [flash], flash.id, { ...catalog, antigravity: [flash] });
    const entry = selectedEntry(providers[1]!.accounts[0])!;
    expect(entry.label).toBe("Gemini 3.8 Flash");
    expect(variantSetting(entry)).toBeUndefined();
    expect(inlineSettings(flash).map((setting) => setting.id)).toEqual(["effort"]);
    expect(modelDefaults(flash)).toEqual({ effort: "high" });
    expect(settingsSummary(flash, { effort: "low" }, {})).toBe("Low");
  });

  it("groups a multi-vendor catalogue by vendor with the model part as the row label, and searches across providers", () => {
    const providers = pickerProviders(choices, choices[2], claude, "opus", catalog);
    const groups = providers.find((item) => item.provider === "hermes")!.accounts[0]!.groups;
    expect(groups.map((group) => [group.title, group.entries.map((entry) => entry.label)])).toEqual([
      ["Auto", ["anthropic/claude-opus-4.6"]],
      ["Anthropic", ["claude-opus-4-8", "claude-fable-5-2"]],
    ]);
    expect(groups.some((group) => group.selected)).toBe(false);
    const results = searchPicker(providers, "opus");
    expect(results.map((section) => [section.account.title, section.groups.flatMap((group) => group.entries.map((entry) => entry.label))]))
      .toEqual([
        ["Claude · Default account", ["Opus 5.5"]],
        ["Claude · Work", ["Opus 5.5"]],
        ["Hermes", ["anthropic/claude-opus-4.6", "claude-opus-4-8"]],
      ]);
    // Raw ids and variant names stay searchable.
    expect(searchPicker(providers, "h-xhigh").map((section) => section.account.title)).toEqual(["Antigravity"]);
    expect(searchPicker(providers, "hydrogen (low)")).toHaveLength(1);
    expect(searchPicker(providers, "")).toEqual([]);
  });

  it("keeps the session's provider while its list is empty, in product order", () => {
    const providers = pickerProviders(choices, choices[2], [], "", { hermes, antigravity: gemini });
    expect(providers.map((item) => [item.provider, item.accounts.map((account) => [account.label, account.own, account.groups.length])])).toEqual([
      ["claude", [["Default account", true, 0], ["Work", false, 0]]],
      ["antigravity", [["Antigravity", false, 1]]],
      ["hermes", [["Hermes", false, 2]]],
    ]);
    // Another provider without models is still left out.
    expect(pickerProviders(choices, choices[1], gemini, "h-low", { hermes }).map((item) => item.provider)).toEqual(["antigravity", "hermes"]);
  });

  it("counts each model once across accounts and finds the row holding a model or its variant", () => {
    const providers = pickerProviders(choices, choices[2], claude, "opus", catalog);
    // Claude 2 (listed by both accounts), Antigravity 1 family, Hermes 3.
    expect(distinctModelCount(providers)).toBe(6);
    const antigravity = providers.find((item) => item.provider === "antigravity")!.accounts[0];
    expect(entryFor(antigravity, "h-medium")?.label).toBe("Gemini 4 Hydrogen");
    expect(entryFor(antigravity, "missing")).toBeUndefined();
    expect(entryFor(antigravity, "")).toBeUndefined();
  });
});

describe("effort carry", () => {
  const effort = (id: string, value: string, labels: string[]) => model({
    settings: [{ id, label: "Reasoning", kind: "select", value, options: labels.map((label) => ({ value: label.toLowerCase(), label })) }],
  });
  const current = effort("effort", "medium", ["Low", "Medium", "High"]);
  const next = effort("reasoningEffort", "low", ["Low", "High", "Max"]);

  it("reads the effort in use and whether it was chosen", () => {
    expect(reasoningLabel(current, {})).toBe("Medium");
    expect(reasoningLabel(current, { effort: "high" })).toBe("High");
    expect(reasoningLabel(model(), {})).toBeUndefined();
    expect(reasoningChosen(current, {})).toBe(false);
    expect(reasoningChosen(current, { effort: "high" })).toBe(true);
  });

  it("carries an effort the next model offers under the same label, otherwise keeps its settings", () => {
    expect(carryReasoning(next, { reasoningEffort: "low", keep: "x" }, "High")).toEqual({ reasoningEffort: "high", keep: "x" });
    expect(carryReasoning(next, {}, "high")).toEqual({ reasoningEffort: "high" });
    expect(carryReasoning(next, { reasoningEffort: "low" }, "Medium")).toEqual({ reasoningEffort: "low" });
    expect(carryReasoning(next, { reasoningEffort: "low" }, undefined)).toEqual({ reasoningEffort: "low" });
    expect(carryReasoning(model(), { keep: "x" }, "High")).toEqual({ keep: "x" });
    expect(carryReasoning(undefined, {}, "High")).toEqual({});
  });
});

describe("settingControl", () => {
  const options = (...labels: string[]) => labels.map((label) => ({ value: label.toLowerCase(), label }));
  it("uses a switch for on/off, a slider for the reasoning scale and segments or chips otherwise", () => {
    expect(settingControl({ id: "fast", options: options("Off", "On") })).toBe("toggle");
    expect(settingControl({ id: "effort", options: options("Low", "Medium", "High", "Max") })).toBe("slider");
    expect(settingControl({ id: "effort", options: options("Low", "Medium", "High") })).toBe("segments");
    expect(settingControl({ id: "variant", options: options("A", "B", "C", "D") })).toBe("select");
    expect(settingControl({ id: "serviceTier", options: options("Standard", "Fast") })).toBe("toggle");
    expect(toggleSides({ id: "serviceTier", options: options("Standard", "Fast") })?.on.value).toBe("fast");
    expect(settingControl({ id: "thinking", options: options("Adaptive", "Off") })).toBe("segments");
  });
});
