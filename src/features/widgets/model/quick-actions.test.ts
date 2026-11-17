import { describe, expect, it } from "vitest";

import { quickActionHref, quickActionItems, recentQuickActionSessions } from "./quick-actions";
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
