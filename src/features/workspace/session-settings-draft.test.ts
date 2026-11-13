import { expect, it } from "vitest";
import { decodeSessionSettingsDraft, encodeSessionSettingsDraft } from "./session-settings-draft";
const baseline = {
  title: "Title",
  provider: "claude" as const,
  accountId: "removed",
  model: "custom-model",
  mode: "supervised" as const,
  modelSettings: { effort: "high" },
};
it("round trips original account, baseline, authority and edited values", () => {
  const value = {
    baseline,
    values: { ...baseline, title: "Draft" },
    authorityGeneration: 3,
    revision: 8,
  };
  expect(decodeSessionSettingsDraft(encodeSessionSettingsDraft(value)!)).toEqual(value);
  expect(encodeSessionSettingsDraft(null)).toBeNull();
});
it.each([
  null,
  [],
  { baseline, values: { ...baseline, provider: "unknown" } },
  { baseline, values: { ...baseline, mode: "invalid" } },
  { baseline, values: { ...baseline, modelSettings: { effort: 4 } } },
  { baseline, values: baseline, authorityGeneration: -1 },
])("rejects malformed local draft before editing: %j", (value) => {
  expect(() => decodeSessionSettingsDraft(JSON.stringify(value))).toThrow();
});
