import { describe, expect, it } from "vitest";

import {
  quickActionHref,
  quickActionItems,
  quickActionMachineId,
  recentQuickActionSessions,
  resolveQuickAction,
} from "./quick-actions";
import { decodeWidgetPreferences } from "./widget-preferences";
import { emptyFeed, widgetFeedFromActivity, type ActivityLike } from "./widget-feed";

describe("quickActionHref", () => {
  it("allows known in-app routes only", () => {
    for (const href of [
      "/sessions",
      "/sessions?new=1",
      "/session/abc?projectId=p&machineId=m",
      "/project/p1",
    ])
      expect(quickActionHref({ params: { href } })).toBe(href);
    for (const href of [
      "/machines",
      "//evil.example",
      "https://evil.example",
      "/sessions#x",
      "/session/",
      5,
      undefined,
    ])
      expect(quickActionHref({ params: { href } })).toBeNull();
    expect(quickActionHref(undefined)).toBeNull();
    expect(quickActionHref({ params: null })).toBeNull();
  });

  it("offers New session and Sessions, both on the allowlist", () => {
    const items = quickActionItems((_tr, en) => en);
    expect(items.map((item) => item.title)).toEqual(["New session", "Sessions"]);
    for (const item of items) expect(quickActionHref(item)).toBe(item.params.href);
  });

  const session = (id: string, updatedAt: number, extra: object = {}) => ({
    id,
    projectId: "p 1",
    projectName: "P",
    title: `Title ${id}`,
    status: "idle" as const,
    updatedAt,
    ...extra,
  });

  it("adds the two newest open sessions within the four-item limit", () => {
    const feed = {
      machineId: "m",
      ready: true,
      sessions: [
        session("a", 1),
        session("b", 3),
        session("c", 2),
        session("old", 9, { archived: true }),
        session("kid", 9, { child: true }),
        session("blank", 9, { title: "  " }),
      ],
    };
    const recents = recentQuickActionSessions(feed, true);
    expect(recents.map((item) => item.id)).toEqual(["b", "c"]);
    const items = quickActionItems((_tr, en) => en, recents);
    expect(items.map((item) => item.title)).toEqual([
      "New session",
      "Title b",
      "Title c",
      "Sessions",
    ]);
    expect(items[1].params.href).toBe("/session/b?projectId=p%201&machineId=m");
    for (const item of items) expect(quickActionHref(item)).toBe(item.params.href);
    expect(
      quickActionItems((_tr, en) => en, [...recents, ...recents, ...recents]).length,
    ).toBe(4);
  });

  it("offers no recent sessions while titles are private or the feed is unsettled", () => {
    const sessions = [session("a", 1)];
    expect(recentQuickActionSessions({ machineId: "m", ready: true, sessions }, false)).toEqual([]);
    expect(recentQuickActionSessions({ machineId: "m", ready: false, sessions }, true)).toEqual([]);
    expect(recentQuickActionSessions({ machineId: null, ready: true, sessions }, true)).toEqual([]);
  });

  it("uses a localized fallback for fresh sessions only when titles may be shown", () => {
    const feed = { machineId: "m", ready: true, sessions: [session("fresh", 1, { title: "" })] };
    expect(recentQuickActionSessions(feed, true, 2, "Yeni oturum")).toEqual([
      expect.objectContaining({ id: "fresh", title: "Yeni oturum" }),
    ]);
    expect(recentQuickActionSessions(feed, false, 2, "Yeni oturum")).toEqual([]);
  });
});

describe("resolveQuickAction", () => {
  const machines = [{ id: "a" }, { id: "b c" }];
  const href = (machineId: string) => `/session/s?projectId=p&machineId=${encodeURIComponent(machineId)}`;

  it("reads the computer a recent-session route names", () => {
    expect(quickActionMachineId(href("b c"))).toBe("b c");
    expect(quickActionMachineId("/sessions?new=1")).toBeNull();
    expect(quickActionMachineId("/project/p1")).toBeNull();
    expect(quickActionMachineId("/session/s?machineId=%E0%A4%A")).toBeNull();
  });

  it("selects the named computer when another one is active", () => {
    expect(resolveQuickAction(href("b c"), machines, "a")).toEqual({ kind: "open", selectMachineId: "b c" });
    expect(resolveQuickAction(href("b c"), machines, null)).toEqual({ kind: "open", selectMachineId: "b c" });
  });

  it("opens without switching when the computer is already active or the route names none", () => {
    expect(resolveQuickAction(href("a"), machines, "a")).toEqual({ kind: "open", selectMachineId: null });
    expect(resolveQuickAction("/sessions?new=1", machines, "a")).toEqual({ kind: "open", selectMachineId: null });
  });

  it("opens nothing for a computer that is no longer paired", () => {
    expect(resolveQuickAction(href("gone"), machines, "a")).toEqual({ kind: "unpaired" });
    expect(resolveQuickAction(href("gone"), [], null)).toEqual({ kind: "unpaired" });
  });
});

describe("decodeWidgetPreferences", () => {
  it("defaults to hidden titles for missing or invalid storage", () => {
    expect(decodeWidgetPreferences(null)).toEqual({ showTitles: false, showQuestionText: false });
    expect(decodeWidgetPreferences("{")).toEqual({ showTitles: false, showQuestionText: false });
    expect(decodeWidgetPreferences('{"showTitles":"yes"}')).toEqual({
      showTitles: false,
      showQuestionText: false,
    });
    expect(decodeWidgetPreferences('{"showTitles":true}')).toEqual({
      showTitles: true,
      showQuestionText: false,
    });
  });
});

describe("widgetFeedFromActivity", () => {
  const activity: ActivityLike = {
    directory: [
      {
        project: { id: "p", name: "Proj" },
        session: {
          id: "s",
          title: "T",
          status: "running",
          updatedAt: 1,
          delegationParent: { id: "x" },
        },
      },
    ],
    directoryReady: true,
    privacyPending: false,
    privacyUnavailable: false,
    complete: true,
  };

  it("forwards sessions only when the directory is settled and error free", () => {
    const feed = widgetFeedFromActivity("m", activity);
    expect(feed.ready).toBe(true);
    expect(feed.sessions[0]).toMatchObject({
      id: "s",
      projectId: "p",
      projectName: "Proj",
      child: true,
    });
    for (const broken of [
      { privacyPending: true },
      { privacyUnavailable: true },
      { directoryReady: false },
      { complete: false },
      { error: new Error("x") },
    ])
      expect(widgetFeedFromActivity("m", { ...activity, ...broken })).toEqual({
        machineId: "m",
        ready: false,
        sessions: [],
      });
    expect(widgetFeedFromActivity(null, activity).ready).toBe(false);
    expect(emptyFeed.ready).toBe(false);
  });
});
