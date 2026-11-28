import { describe, expect, it } from "vitest";
import { effortLabel, effortRank, effortVariant, foldedVariant, foldVariants, upstreamOf, variantFor } from "./model-variants";

const named = (...names: string[]) => names.map((name, index) => ({ id: `m${index}`, name }));
const fold = (...names: string[]) => foldVariants(named(...names), (item) => item.name);

describe("effort variants", () => {
  it("reads only an effort token as a variant", () => {
    expect(effortVariant("Gemini 4 Hydrogen (XHigh)")).toEqual({ family: "Gemini 4 Hydrogen", variant: "XHigh" });
    expect(effortVariant("Model (extra high)")).toEqual({ family: "Model", variant: "extra high" });
    expect(effortVariant("Gemini Solo (Preview)")).toBeUndefined();
    expect(effortVariant("Opus 5.5")).toBeUndefined();
    expect(effortLabel("XHigh")).toBe("Extra High");
    expect(effortLabel("medium")).toBe("Medium");
    expect(["Max", "Low", "Extra High", "None", "Medium", "Minimal", "High"].sort((a, b) => effortRank(a) - effortRank(b)))
      .toEqual(["None", "Minimal", "Low", "Medium", "High", "Extra High", "Max"]);
    expect(effortRank("Preview")).toBe(-1);
  });

  it("folds a family into one row with its efforts in rank order, at its first variant's place", () => {
    const rows = fold("Gemini 4 Hydrogen (High)", "Flash", "Gemini 4 Hydrogen (XHigh)", "Gemini 4 Hydrogen (Medium)", "Gemini 4 Hydrogen (Low)");
    expect(rows.map((row) => row.label)).toEqual(["Gemini 4 Hydrogen", "Flash"]);
    expect(rows[0]!.item.id).toBe("m0");
    expect(rows[0]!.variants!.map((variant) => [variant.label, variant.item.id])).toEqual([
      ["Low", "m4"], ["Medium", "m3"], ["High", "m0"], ["Extra High", "m2"],
    ]);
    expect(rows[1]!.variants).toBeUndefined();
  });

  it("keeps a single effort model and non-effort suffixes as plain rows", () => {
    expect(fold("Solo (High)", "Beta (Preview)", "Beta (Experimental)").map((row) => [row.label, !!row.variants]))
      .toEqual([["Solo (High)", false], ["Beta (Preview)", false], ["Beta (Experimental)", false]]);
  });

  it("opens a picked family at the effort in use when it has it, otherwise at its first variant", () => {
    const [row] = fold("Flash (High)", "Flash (Medium)", "Flash (Low)");
    expect(variantFor(row!, "Low").id).toBe("m2");
    expect(variantFor(row!, "XHigh").id).toBe("m0");
    expect(variantFor(row!, undefined).id).toBe("m0");
  });
});

describe("upstream groups", () => {
  it("takes the vendor from the provider field, or from the name in multi-vendor harnesses", () => {
    expect(upstreamOf("opencode", "Claude Opus", { name: "Anthropic" })).toEqual({ group: "Anthropic", label: "Claude Opus" });
    expect(upstreamOf("hermes", "Anthropic · claude-opus-4-8", { name: "Anthropic" })).toEqual({ group: "Anthropic", label: "claude-opus-4-8" });
    expect(upstreamOf("hermes", "Auto · anthropic/claude-opus-4.6")).toEqual({ group: "Auto", label: "anthropic/claude-opus-4.6" });
    // Other providers keep their names whole.
    expect(upstreamOf("claude", "Opus 5.5 · 1M")).toEqual({ label: "Opus 5.5 · 1M" });
    expect(upstreamOf("hermes", "plain-model")).toEqual({ label: "plain-model" });
  });
});

describe("folded variant name", () => {
  it("folds a name only when its family has two or more listed variants, like the picker", () => {
    const lone = named("Gemini Solo (High)", "Opus 5.5");
    expect(foldedVariant("Gemini Solo (High)", lone, (item) => item.name)).toBeUndefined();
    const family = named("Gemini 4 Hydrogen (Low)", "gemini 4 hydrogen (High)");
    expect(foldedVariant("Gemini 4 Hydrogen (Low)", family, (item) => item.name)).toEqual({ family: "Gemini 4 Hydrogen", variant: "Low" });
    expect(foldedVariant("Opus 5.5", family, (item) => item.name)).toBeUndefined();
  });
});
