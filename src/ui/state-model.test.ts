import { expect, it } from "vitest";
import { errorIllustration, errorTitle } from "./state-model";

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
