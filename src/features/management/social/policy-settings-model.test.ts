import { describe, expect, it } from "vitest";
import { policyDraft, readPolicies, reviewedPolicies } from "./policy-settings-model";

describe("reviewed social policies", () => {
  it("preserves other scopes and applies explicit platform overrides", () => {
    const base = readPolicies({ global: { maxContentCharacters: 500 }, platforms: { telegram: { maxMessageCharacters: 1000 } } });
    const draft = policyDraft({ maxCommentCharacters: 90 });
    expect(reviewedPolicies(base, "x", draft)).toEqual({ ...base, platforms: { ...base.platforms, x: { maxCommentCharacters: 90 } } });
    expect(base.platforms.x).toBeUndefined();
  });
  it("omits blank limits to inherit and validates agent and bounded whole limits", () => {
    const base = readPolicies({ global: {}, platforms: {} });
    const draft = policyDraft({});
    expect(reviewedPolicies(base, "x", draft).platforms.x).toEqual({});
    for (const text of ["0", "20001", "2.5", "1e3", "-1"]) {
      expect(() => reviewedPolicies(base, "global", { ...draft, limits: { ...draft.limits, maxContentCharacters: text } })).toThrow();
    }
    expect(() => reviewedPolicies(base, "global", { ...draft, model: "model" })).toThrow();
    expect(() => reviewedPolicies(base, "global", { ...draft, provider: "forged" })).toThrow();
  });
});
