import { describe, expect, it } from "vitest";
import { resolveCreationSelection } from "./creation-selection";

describe("creation selection", () => {
  it("falls back to the bundled models of the first provider when no catalog has arrived", () => {
    const selection = resolveCreationSelection(["claude"], undefined, [], { model: "" });
    expect(selection.selectedProvider).toBe("claude");
    expect(selection.selectedModel).not.toBe("");
    expect(selection.bundled).toBe(true);
  });

  it("offers nothing to start when the computer has no provider", () => {
    const selection = resolveCreationSelection([], undefined, [], { model: "" });
    expect(selection.selectedProvider).toBeUndefined();
    expect(selection.selectedModel).toBe("");
  });

  it("keeps an explicit model id", () => {
    expect(resolveCreationSelection(["claude"], undefined, [], { provider: "claude", model: "custom-model" }).selectedModel)
      .toBe("custom-model");
  });
});
