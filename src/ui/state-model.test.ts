import { expect, it } from "vitest";
import { errorIllustration, errorTitle, isErrorArt, queryStateSize, resolveStateSize } from "./state-model";

it("chooses art from the remote error kind", () => {
  expect(errorIllustration("network")).toBe("unreachable");
  expect(errorIllustration("timeout")).toBe("unreachable");
  expect(errorIllustration("auth")).toBe("locked");
  expect(errorIllustration("identity")).toBe("locked");
  expect(errorIllustration("host")).toBe("error");
  expect(errorIllustration(undefined)).toBe("error");
  expect(errorIllustration("network", true)).toBe("offline");
  expect(errorIllustration("offline")).toBe("offline");
});
it("titles follow the art", () => {
  const copy = (_tr: string, en: string) => en;
  expect(errorTitle("network", copy)).toBe("Can't reach your computer");
  expect(errorTitle("auth", copy)).toBe("Access needed");
  expect(errorTitle(undefined, copy, true)).toBe("You're offline");
  expect(errorTitle(undefined, copy)).toBe("Something went wrong");
});

it("never treats first-run, unpaired or empty art as an error", () => {
  for (const name of ["error", "unreachable", "offline", "locked"] as const) expect(isErrorArt(name)).toBe(true);
  for (const name of ["connect-computer", "no-projects", "inbox-empty", "search-empty", "permission"] as const)
    expect(isErrorArt(name)).toBe(false);
});

it("sizes query states by scope ownership, explicit size, compact flag and loading shape", () => {
  expect(queryStateSize({ loading: "list", owner: false, size: "region" })).toBe("line");
  expect(queryStateSize({ loading: "inline", owner: true, size: "region" })).toBe("region");
  expect(queryStateSize({ loading: "list", owner: true, compact: true })).toBe("compact");
  expect(queryStateSize({ loading: "list", owner: true })).toBe("region");
  expect(queryStateSize({ loading: "centered", owner: true })).toBe("region");
  expect(queryStateSize({ loading: "inline", owner: true })).toBe("compact");
  expect(queryStateSize({ loading: "none", owner: true })).toBe("compact");
  expect(queryStateSize({ loading: "none", owner: true, art: true })).toBe("region");
  expect(resolveStateSize(undefined, true)).toBe("compact");
  expect(resolveStateSize("line", true)).toBe("line");
  expect(resolveStateSize(undefined)).toBe("region");
});
