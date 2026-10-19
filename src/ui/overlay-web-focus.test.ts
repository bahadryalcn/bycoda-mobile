import { expect, it } from "vitest";
import { asWebElement, uniqueFocusIdentityMatch } from "./overlay-web-focus";

const filters = { tag: "BUTTON", role: "button", label: "Filters" };

it("finds the remounted action by accessible identity without depending on its presentation", () => {
  const replacement = { variant: "primary" };
  expect(
    uniqueFocusIdentityMatch(filters, [
      { identity: { ...filters, label: "Close" }, value: { variant: "ghost" } },
      { identity: filters, value: replacement },
    ]),
  ).toBe(replacement);
});

it("does not guess between duplicate controls or controls with a different role or tag", () => {
  expect(
    uniqueFocusIdentityMatch(filters, [
      { identity: filters, value: "first" },
      { identity: filters, value: "second" },
    ]),
  ).toBeNull();
  expect(
    uniqueFocusIdentityMatch(filters, [
      { identity: { ...filters, role: "link" }, value: "link" },
      { identity: { ...filters, tag: "INPUT" }, value: "input" },
    ]),
  ).toBeNull();
  expect(
    uniqueFocusIdentityMatch({ ...filters, label: "" }, [
      { identity: { ...filters, label: "" }, value: "unnamed" },
    ]),
  ).toBeNull();
});

it("loads safely without browser globals on a native or server runtime", () => {
  expect(typeof HTMLElement).toBe("undefined");
  expect(asWebElement({})).toBeNull();
});
