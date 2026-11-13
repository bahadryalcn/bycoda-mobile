import { expect, it } from "vitest";
import { parseWorkCapFields, workCapFields } from "./work-caps-model";

it("keeps blank unlimited distinct from explicit zero and accepts decimal USD", () => {
  const value = { ...workCapFields(), dailyTokens: "0", monthlyTokens: "9007199254740991", dailyCost: "0.25" };
  expect(parseWorkCapFields(value)).toEqual({ daily: { tokens: 0, costUsd: 0.25 }, monthly: { tokens: Number.MAX_SAFE_INTEGER, costUsd: undefined } });
  expect(workCapFields({ daily: { tokens: 0, costUsd: 0 } })).toEqual({ dailyTokens: "0", dailyCost: "0", monthlyTokens: "", monthlyCost: "" });
});
it("rejects unsafe or fractional tokens and malformed or negative costs", () => {
  for (const dailyTokens of ["9007199254740992", "1.5", "-1", "1e3", " 2"])
    expect(parseWorkCapFields({ ...workCapFields(), dailyTokens })).toBeUndefined();
  for (const monthlyCost of ["-1", "NaN", "Infinity", "1e309", "1.2.3"])
    expect(parseWorkCapFields({ ...workCapFields(), monthlyCost })).toBeUndefined();
});
