import { expect, it } from "vitest";
import { readInitializedSubmodules } from "./submodule-model";
it("validates bounded relative metadata, preserving nested names and spaces", () => {
  expect(readInitializedSubmodules(["z/deep module", "a", "a"])).toEqual(["a", "z/deep module"]);
  for (const input of [null, {}, ["../escape"], ["/absolute"], ["C:/absolute"], ["a\\b"], ["a//b"], ["a/./b"], ["a\0b"], new Array(257).fill("a")]) {
    expect(() => readInitializedSubmodules(input)).toThrow();
  }
});
