import { describe, expect, it } from "vitest";
import {
  coldEntryAlignment,
  createPushGate,
  externalEntryTab,
  focusedPath,
  hrefKey,
  hrefPath,
  isPristineRoot,
  routeParent,
  routeSegments,
} from "./navigation-model";

describe("routeParent", () => {
  it("maps every pushed page family to its logical parent and tab", () => {
    const cases: [string, string, string][] = [
      ["session/[id]", "/chats", "chats"],
      ["/session/abc?machineId=m", "/chats", "chats"],
      ["/session-reference?ref=x", "/chats", "chats"],
      ["/sessions?new=1&prompt=hi", "/chats", "chats"],
      ["pull-requests/[id]", "/pull-requests", "index"],
      ["/pull-requests?projectId=p", "/", "index"],
      ["pull-requests/index", "/", "index"],
      ["inbox/record", "/inbox", "inbox"],
      ["/inbox/review-file?path=a", "/inbox", "inbox"],
      ["inbox/jira", "/inbox", "inbox"],
      ["/approvals?focus=a", "/inbox", "inbox"],
      ["settings/assistant", "/settings", "settings"],
      ["/settings/notifications", "/settings", "settings"],
      ["account", "/settings", "settings"],
      ["legal/[document]", "/settings", "settings"],
      ["licenses", "/settings", "settings"],
      ["report", "/settings", "settings"],
      ["manage/[section]", "/manage", "manage"],
      ["/tools/terminals?projectId=p", "/manage", "manage"],
      ["project/[id]", "/", "index"],
      ["machines", "/", "index"],
      ["assistant", "/", "index"],
    ];
    for (const [route, href, tab] of cases) expect(routeParent(route), route).toEqual({ href, tab });
  });

  it("gives tab roots no parent, including route groups", () => {
    for (const root of ["/", "", "index", "/chats", "(tabs)/inbox", "/(tabs)", "settings", "/manage?x=1", undefined, null])
      expect(routeParent(root), String(root)).toBeNull();
  });

  it("reads object hrefs by pathname and strips query, hash and groups", () => {
    expect(routeParent({ pathname: "/session/[id]" })).toEqual({ href: "/chats", tab: "chats" });
    expect(routeSegments("/(tabs)/inbox?x=1#y")).toEqual(["inbox"]);
  });
});

const tabs = (index: number, names = ["index", "chats", "inbox", "manage", "settings"], history?: unknown[]) => ({
  key: "tabs-state",
  index,
  routes: names.map((name) => ({ key: `${name}-k`, name })),
  ...(history ? { history } : {}),
});

describe("isPristineRoot", () => {
  it("is true only for the launch position: tabs alone, on Home, nothing visited", () => {
    expect(isPristineRoot({ key: "root", index: 0, routes: [{ key: "t", name: "(tabs)" }] })).toBe(true);
    expect(isPristineRoot({ key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabs(0) }] })).toBe(true);
    expect(isPristineRoot({ key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabs(2) }] })).toBe(false);
    expect(isPristineRoot({ key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabs(0, undefined, [1, 2]) }] })).toBe(false);
    expect(isPristineRoot({ key: "root", index: 1, routes: [{ key: "t", name: "(tabs)" }, { key: "p", name: "project/[id]" }] })).toBe(false);
    expect(isPristineRoot(undefined)).toBe(false);
  });
});

describe("coldEntryAlignment", () => {
  it("focuses the page's parent tab beneath a cold deep link", () => {
    const root = { key: "root", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabs(0) }, { key: "s", name: "session/[id]" }] };
    expect(coldEntryAlignment(root)).toEqual({ tabsKey: "tabs-state", tab: "chats", entryKey: "s" });
    const settings = { ...root, routes: [root.routes[0]!, { key: "g", name: "settings/general" }] };
    expect(coldEntryAlignment(settings)?.tab).toBe("settings");
  });

  it("waits for the mounted tabs and leaves Home, user history and deeper stacks alone", () => {
    const entry = { key: "s", name: "session/[id]" };
    expect(coldEntryAlignment({ key: "r", index: 1, routes: [{ key: "t", name: "(tabs)" }, entry] })).toBeNull();
    expect(coldEntryAlignment({ key: "r", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabs(0) }, { key: "p", name: "project/[id]" }] })).toBeNull();
    expect(coldEntryAlignment({ key: "r", index: 1, routes: [{ key: "t", name: "(tabs)", state: tabs(3) }, entry] })).toBeNull();
    expect(coldEntryAlignment({ key: "r", index: 2, routes: [{ key: "t", name: "(tabs)", state: tabs(0) }, entry, { key: "x", name: "machines" }] })).toBeNull();
  });
});

describe("externalEntryTab", () => {
  const launch = { key: "root", index: 0, routes: [{ key: "t", name: "(tabs)", state: tabs(0) }] };
  it("puts the parent tab beneath an entry opened from the launch position", () => {
    expect(externalEntryTab(launch, { pathname: "/session/[id]" })).toBe("chats");
    expect(externalEntryTab(launch, "/approvals?focus=a")).toBe("inbox");
    expect(externalEntryTab(launch, "/sessions?new=1&n=share1")).toBe("chats");
  });
  it("keeps the user's own history and Home-parented pages as they are", () => {
    expect(externalEntryTab(launch, "/project/p1")).toBeNull();
    expect(externalEntryTab(launch, "/chats")).toBeNull();
    const elsewhere = { ...launch, routes: [{ key: "t", name: "(tabs)", state: tabs(2) }] };
    expect(externalEntryTab(elsewhere, "/session/s")).toBeNull();
    expect(externalEntryTab(undefined, "/session/s")).toBeNull();
  });
});

describe("push gate", () => {
  it("drops a double tap of the same destination, then lets later and different taps through", () => {
    let now = 0;
    const gate = createPushGate({ now: () => now });
    expect(gate("/machines")).toBe(true);
    now = 100;
    expect(gate("/machines")).toBe(false);
    expect(gate("/report")).toBe(true);
    now = 300;
    expect(gate("/report")).toBe(false);
    now = 1200;
    expect(gate("/report")).toBe(true);
  });

  it("compares the page in front with a destination by concrete path", () => {
    const root = { key: "root", index: 1, routes: [
      { key: "t", name: "(tabs)", state: { key: "ts", index: 1, routes: [{ key: "i", name: "index" }, { key: "c", name: "chats" }] } },
      { key: "s", name: "session/[id]", params: { id: "a b", machineId: "m" } },
    ] };
    expect(focusedPath(root)).toBe("/session/a%20b");
    expect(hrefPath({ pathname: "/session/[id]", params: { id: "a b", machineId: "m" } })).toBe("/session/a%20b");
    expect(hrefPath("/session/a%20b?machineId=m")).toBe("/session/a%20b");
    expect(focusedPath({ key: "root", index: 0, routes: [root.routes[0]!] })).toBe("/chats");
    expect(hrefPath("/")).toBe("/");
    expect(focusedPath(undefined)).toBeNull();
  });

  it("identifies object hrefs by pathname and defined params in any order", () => {
    expect(hrefKey({ pathname: "/session/[id]", params: { id: "a", machineId: "m" } }))
      .toBe(hrefKey({ pathname: "/session/[id]", params: { machineId: "m", id: "a", projectId: undefined } }));
    expect(hrefKey({ pathname: "/session/[id]", params: { id: "a" } })).not.toBe(hrefKey({ pathname: "/session/[id]", params: { id: "b" } }));
  });
});
