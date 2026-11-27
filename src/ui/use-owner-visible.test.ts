// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ focused: true, security: { appState: "active", windowFocused: true } }));
vi.mock("./use-route-focus", () => ({ useRouteFocus: () => fixture.focused }));
vi.mock("@/state/security", () => ({ useSecurity: (select: (state: typeof fixture.security) => unknown) => select(fixture.security) }));

import { HiddenContentContext, useOwnerVisible } from "./use-owner-visible";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  fixture.focused = true;
  fixture.security = { appState: "active", windowFocused: true };
});

function visible(hidden?: boolean) {
  let seen: boolean | undefined;
  const Probe = () => { seen = useOwnerVisible(); return null; };
  const container = document.createElement("div");
  root = createRoot(container);
  act(() => root!.render(hidden === undefined ? h(Probe) : h(HiddenContentContext.Provider, { value: hidden }, h(Probe))));
  act(() => root!.unmount());
  root = undefined;
  return seen;
}

it("is visible on a focused route of a foreground, unlocked app", () => {
  expect(visible()).toBe(true);
  expect(visible(false)).toBe(true);
});

it("stops for the workspace hidden behind the lock", () => {
  expect(visible(true)).toBe(false);
});

it("stops off-route, in the background and behind another window", () => {
  fixture.focused = false;
  expect(visible()).toBe(false);
  fixture.focused = true;
  fixture.security = { appState: "background", windowFocused: true };
  expect(visible()).toBe(false);
  fixture.security = { appState: "active", windowFocused: false };
  expect(visible()).toBe(false);
});
