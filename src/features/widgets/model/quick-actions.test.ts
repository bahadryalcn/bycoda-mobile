import { describe, expect, it } from "vitest";

import { quickActionHref, quickActionItems } from "./quick-actions";
import { decodeWidgetPreferences } from "./widget-preferences";
import { emptyFeed, widgetFeedFromActivity, type ActivityLike } from "./widget-feed";

describe("quickActionHref", () => {
  it("allows known in-app routes only", () => {
    for (const href of ["/sessions", "/sessions?new=1", "/session/abc?projectId=p&machineId=m", "/project/p1"])
      expect(quickActionHref({ params: { href } })).toBe(href);
    for (const href of ["/machines", "//evil.example", "https://evil.example", "/sessions#x", "/session/", 5, undefined])
      expect(quickActionHref({ params: { href } })).toBeNull();
    expect(quickActionHref(undefined)).toBeNull();
    expect(quickActionHref({ params: null })).toBeNull();
  });

  it("offers New session and Sessions, both on the allowlist", () => {
    const items = quickActionItems((_tr, en) => en);
    expect(items.map((item) => item.title)).toEqual(["New session", "Sessions"]);
    for (const item of items) expect(quickActionHref(item)).toBe(item.params.href);
  });
});

describe("decodeWidgetPreferences", () => {
  it("defaults to hidden titles for missing or invalid storage", () => {
    expect(decodeWidgetPreferences(null)).toEqual({ showTitles: false });
    expect(decodeWidgetPreferences("{")).toEqual({ showTitles: false });
    expect(decodeWidgetPreferences('{"showTitles":"yes"}')).toEqual({ showTitles: false });
    expect(decodeWidgetPreferences('{"showTitles":true}')).toEqual({ showTitles: true });
  });
});

describe("widgetFeedFromActivity", () => {
  const activity: ActivityLike = {
    directory: [
      {
        project: { id: "p", name: "Proj" },
        session: { id: "s", title: "T", status: "running", updatedAt: 1, delegationParent: { id: "x" } },
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
    expect(feed.sessions[0]).toMatchObject({ id: "s", projectId: "p", projectName: "Proj", child: true });
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
