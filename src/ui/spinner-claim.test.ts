import { expect, it } from "vitest";
import { claimSpinner, spinnerHolder } from "./spinner-claim";

it("lets only the newest busy control draw the spinner", () => {
  const toolbar = Symbol("toolbar");
  const retry = Symbol("retry");
  const releaseToolbar = claimSpinner(toolbar);
  expect(spinnerHolder(toolbar)).toBe(true);
  const releaseRetry = claimSpinner(retry);
  expect(spinnerHolder(retry)).toBe(true);
  expect(spinnerHolder(toolbar)).toBe(false);
  releaseRetry();
  expect(spinnerHolder(toolbar)).toBe(true);
  releaseToolbar();
  expect(spinnerHolder(retry)).toBe(true);
});
