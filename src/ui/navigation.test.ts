// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const r = vi.hoisted(() => ({
  canGoBack: vi.fn(() => true),
  back: vi.fn(),
  dismissTo: vi.fn(),
  push: vi.fn(),
  navigate: vi.fn(),
}));
const nav = vi.hoisted(() => ({
  root: undefined as unknown,
  ready: true,
  dispatch: vi.fn(),
}));
vi.mock("expo-router", () => ({
  router: r,
  useNavigationContainerRef: () => ref,
  useRootNavigationState: () => nav.root,
}));
const ref = { isReady: () => nav.ready, getRootState: () => nav.root, dispatch: nav.dispatch };

import { NavigationAnchor, goBack, leaveTo, openExternalEntry, pushOnce } from "./navigation";

beforeEach(() => {
  for (const fn of Object.values(r)) fn.mockClear();
  nav.dispatch.mockClear();
  r.canGoBack.mockReturnValue(true);
  nav.root = undefined;
  nav.ready = true;
});
afterEach(() => vi.unstubAllGlobals());

async function mountAnchor() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(h(NavigationAnchor)));
  return {
    rerender: () => act(async () => root.render(h(NavigationAnchor))),
    unmount: () => act(async () => root.unmount()),
  };
}

const tabsState = (index = 0) => ({ key: "tabs-state", index, routes: ["index", "chats", "inbox", "manage", "settings"].map((name) => ({ key: name, name })) });

describe("goBack", () => {
  it("returns to the previous screen when there is one", () => {
    goBack("/settings");
    expect(r.back).toHaveBeenCalledOnce();
    expect(r.dismissTo).not.toHaveBeenCalled();
  });

  it("without history goes to the fallback, else the page's parent, else Home, never replace", () => {
    r.canGoBack.mockReturnValue(false);
    goBack("/settings");
    goBack(undefined, "/inbox/record");
    goBack();
    expect(r.back).not.toHaveBeenCalled();
    expect(r.dismissTo.mock.calls).toEqual([["/settings"], ["/inbox"], ["/"]]);
  });
});

it("leaveTo returns to a destination already in the stack instead of stacking a copy", () => {
  leaveTo("/");
  expect(r.dismissTo).toHaveBeenCalledWith("/");
});

describe("pushOnce", () => {
  it("opens a double-tapped destination once and never pushes the page already in front", async () => {
    nav.root = { key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabsState() }] };
    const anchor = await mountAnchor();
    try {
      pushOnce("/machines");
      pushOnce("/machines");
      expect(r.push).toHaveBeenCalledTimes(1);
      nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabsState() }, { key: "s", name: "session/[id]", params: { id: "a" } }] };
      pushOnce({ pathname: "/session/[id]", params: { id: "a" } } as never);
      expect(r.push).toHaveBeenCalledTimes(1);
      pushOnce({ pathname: "/session/[id]", params: { id: "b" } } as never);
      expect(r.push).toHaveBeenCalledTimes(2);
    } finally { await anchor.unmount(); }
  });

  it("passes pushes through when no navigator is mounted", () => {
    pushOnce("/report");
    pushOnce("/report");
    expect(r.push).toHaveBeenCalledTimes(2);
  });
});

describe("openExternalEntry", () => {
  it("from the launch position focuses the parent tab first, then opens the page", async () => {
    nav.root = { key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabsState() }] };
    const anchor = await mountAnchor();
    try {
      openExternalEntry({ pathname: "/session/[id]", params: { id: "s" } } as never);
      expect(r.navigate.mock.calls).toEqual([["/chats"], [{ pathname: "/session/[id]", params: { id: "s" } }]]);
    } finally { await anchor.unmount(); }
  });

  it("from the user's own position only navigates; push is used when asked", async () => {
    nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabsState() }, { key: "p", name: "project/[id]" }] };
    const anchor = await mountAnchor();
    try {
      openExternalEntry("/approvals" as never);
      openExternalEntry("/session/s" as never, { push: true });
      expect(r.navigate.mock.calls).toEqual([["/approvals"]]);
      expect(r.push.mock.calls).toEqual([["/session/s"]]);
    } finally { await anchor.unmount(); }
  });

  it("without a mounted navigator opens the page as is", () => {
    openExternalEntry("/session/s" as never);
    expect(r.navigate.mock.calls).toEqual([["/session/s"]]);
  });
});

describe("NavigationAnchor", () => {
  it("focuses the parent tab beneath a cold deep link once the tabs mount, and only once", async () => {
    // The first ready state: the page from the initial URL over tabs that have not mounted yet.
    nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)" }, { key: "s", name: "session/[id]" }] };
    const anchor = await mountAnchor();
    try {
      expect(nav.dispatch).not.toHaveBeenCalled();
      nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabsState() }, { key: "s", name: "session/[id]" }] };
      await anchor.rerender();
      expect(nav.dispatch.mock.calls).toEqual([[{ type: "NAVIGATE", payload: { name: "chats" }, target: "tabs-state" }]]);
      nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabsState() }, { key: "s", name: "session/[id]" }] };
      await anchor.rerender();
      expect(nav.dispatch).toHaveBeenCalledTimes(1);
      // The tabs remount when the saved computers hydrate; the new navigator starts on Home again.
      nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: { ...tabsState(), key: "tabs-2" } }, { key: "s", name: "session/[id]" }] };
      await anchor.rerender();
      expect(nav.dispatch).toHaveBeenLastCalledWith({ type: "NAVIGATE", payload: { name: "chats" }, target: "tabs-2" });
      // Once the user leaves the launch page, nothing beneath is touched any more.
      nav.root = { key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: { ...tabsState(), key: "tabs-3" } }] };
      await anchor.rerender();
      nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: { ...tabsState(), key: "tabs-3" } }, { key: "s", name: "session/[id]" }] };
      await anchor.rerender();
      expect(nav.dispatch).toHaveBeenCalledTimes(2);
    } finally { await anchor.unmount(); }
  });

  it("leaves a launch on Home and later pushes alone", async () => {
    nav.root = { key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabsState() }] };
    const anchor = await mountAnchor();
    try {
      nav.root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabsState() }, { key: "s", name: "session/[id]" }] };
      await anchor.rerender();
      expect(nav.dispatch).not.toHaveBeenCalled();
    } finally { await anchor.unmount(); }
  });
});
