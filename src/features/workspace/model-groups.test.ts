import { describe, expect, it } from "vitest";
import type { HostModelCatalog } from "./wire";
import { delegationCandidates } from "./delegation-model";
import { delegationOptions, groupModels, modelVariant, providerRank } from "./model-groups";
import { filterSelection } from "@/ui/selection-model";

const catalog = {
  accounts: {
    claude: [
      { id: "default", label: "Host default" },
      { id: "work", label: "work" },
      { id: "personal", label: "Personal" },
    ],
  },
  models: {
    antigravity: [
      { id: "h-high", name: "Gemini 4 Hydrogen (High)", harness: "antigravity" },
      { id: "flash-high", name: "Gemini 3.8 Flash (High)", harness: "antigravity" },
      { id: "h-low", name: "Gemini 4 Hydrogen (Low)", harness: "antigravity" },
      { id: "flash-low", name: "Gemini 3.8 Flash (Low)", harness: "antigravity" },
      { id: "solo", name: "Gemini Solo (Preview)", harness: "antigravity" },
    ],
    opencode: [{ id: "beam", name: "Beam Free", harness: "opencode" }],
    codex: [{ id: "terra", name: "GPT-6.1 Terra", harness: "codex" }],
    claude: [
      { id: "opus", name: "Opus 5.5", harness: "claude" },
      { id: "sonnet", name: "Sonnet 5.5", harness: "claude" },
    ],
  },
  errors: {},
} as unknown as HostModelCatalog;

describe("model groups", () => {
  // The session's provider list can start anywhere; the groups always follow product order.
  const candidates = delegationCandidates(catalog, ["antigravity", "opencode", "codex", "claude"], "Default account");

  it("orders providers like the product and keeps unknown providers last", () => {
    expect(["opencode", "claude", "custom", "codex", "antigravity"].sort((a, b) => providerRank(a) - providerRank(b)))
      .toEqual(["claude", "codex", "opencode", "antigravity", "custom"]);
  });

  it("makes one section per provider account with the default login first and readable names", () => {
    const sections = groupModels(candidates);
    expect(sections.map((section) => section.title)).toEqual([
      "Claude · Default account", "Claude · work", "Claude · Personal", "Codex", "OpenCode", "Antigravity",
    ]);
    // Each account lists its models once, in the Host's order (most capable first).
    expect(sections[1]!.rows.map((row) => row.label)).toEqual(["Opus 5.5", "Sonnet 5.5"]);
    expect(sections.flatMap((section) => section.rows).some((row) => /Host default/.test(row.item.label))).toBe(false);
  });

  it("keeps effort variants of one model together under the model's name", () => {
    const antigravity = groupModels(candidates).at(-1)!;
    expect(antigravity.rows.map((row) => [row.family, row.label])).toEqual([
      ["Gemini 4 Hydrogen", "High"],
      ["Gemini 4 Hydrogen", "Low"],
      ["Gemini 3.8 Flash", "High"],
      ["Gemini 3.8 Flash", "Low"],
      // A single parenthesised name is a plain model, not a family.
      [undefined, "Gemini Solo (Preview)"],
    ]);
  });

  it("parses a trailing variant only", () => {
    expect(modelVariant("Gemini 4 Hydrogen (XHigh)")).toEqual({ family: "Gemini 4 Hydrogen", variant: "XHigh" });
    expect(modelVariant("Opus 5.5")).toEqual({ family: "Opus 5.5" });
  });

  it("gives the subagent picker grouped options that keep full names and search across groups", () => {
    const options = delegationOptions(candidates);
    expect(options[0]).toMatchObject({
      group: "Claude · Default account", label: "Opus 5.5", summaryLabel: "Opus 5.5 · Default account",
    });
    expect(options.find((option) => option.value.includes("h-low"))).toMatchObject({
      group: "Antigravity", subgroup: "Gemini 4 Hydrogen", label: "Low", summaryLabel: "Gemini 4 Hydrogen (Low)",
    });
    expect(filterSelection(options, "hydrogen").map((option) => option.label)).toEqual(["High", "Low"]);
    expect(filterSelection(options, "work").map((option) => option.summaryLabel)).toEqual(["Opus 5.5 · work", "Sonnet 5.5 · work"]);
    expect(filterSelection(options, "opencode").map((option) => option.label)).toEqual(["Beam Free"]);
  });
});
