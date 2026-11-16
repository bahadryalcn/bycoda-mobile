import { describe, expect, it } from "vitest";
import { mergeWidgetUpdate, parseWidgetUpdate, type WidgetCache } from "./background-snapshot";
import { buildWidgetSnapshot } from "./snapshot";
import { widgetPalette } from "./palette";
import { widgetLabels } from "./widget-labels";

const now = 1_800_000_000_000;
function cache(): WidgetCache {
  const sessions = [
    {
      id: "s",
      projectId: "p",
      projectName: "Project",
      title: "Opt-in title",
      status: "running" as const,
      updatedAt: now - 1000,
      startedAt: now - 10_000,
    },
  ];
  return {
    environmentId: "env",
    machineId: "m",
    machineName: "PC",
    backgroundAllowed: true,
    showTitles: true,
    showQuestionText: true,
    sessions,
    lastPushAt: now - 1000,
    snapshot: buildWidgetSnapshot({
      machine: { id: "m", name: "PC" },
      unlocked: true,
      ready: true,
      sessions,
      showTitles: true,
      now: now - 1000,
      labels: widgetLabels((_tr, en) => en),
      palette: widgetPalette,
    })!,
  };
}
function push(
  overrides: Record<string, unknown> = {},
  rows = [{ id: "s", projectId: "p", kind: "question", status: "running", updatedAt: now }],
) {
  return {
    kind: "widget",
    environmentId: "env",
    widget: JSON.stringify({ v: 1, at: now, complete: true, sessions: rows, ...overrides }),
  };
}
describe("background widget privacy and freshness", () => {
  it("merges status with local opt-in title, never copies question text or raw error from push", () => {
    const data = push();
    const payload = JSON.parse(data.widget);
    payload.sessions[0].questionPrompt = "token from push";
    payload.sessions[0].error = "secret path";
    data.widget = JSON.stringify(payload);
    const result = mergeWidgetUpdate(cache(), data, now)!;
    expect(result.snapshot.counts.needsInput).toBe(1);
    expect(result.snapshot.sessions[0]).toMatchObject({
      kind: "question",
      title: "Opt-in title",
      detail: "Waiting for your answer",
    });
    expect(JSON.stringify(result)).not.toContain("token from push");
    expect(JSON.stringify(result)).not.toContain("secret path");
  });
  it("uses known project identity for a new session, leaving unknown projects private and stale", () => {
    const result = mergeWidgetUpdate(
      cache(),
      push({}, [{ id: "new", projectId: "p", kind: "running", status: "running", updatedAt: now }]),
      now,
    )!;
    expect(result.snapshot.sessions[0]).toMatchObject({ id: "new", project: "Project", title: "" });
    expect(result.snapshot.sessions[0].url).toContain("machineId=m");
    const unknown = mergeWidgetUpdate(
      cache(),
      push({}, [
        { id: "other", projectId: "hidden", kind: "question", status: "running", updatedAt: now },
      ]),
      now,
    )!;
    expect(unknown.snapshot.sessions).toEqual([]);
    expect(unknown.snapshot.stale).toBe(true);
  });
  it("refreshes an initially empty known project and retains idle title metadata for a later start", () => {
    const stored = { ...cache(), projects: [{ id: "p", name: "Empty project" }], sessions: [] };
    expect(mergeWidgetUpdate(stored, push(), now)!.snapshot.sessions[0]).toMatchObject({
      id: "s",
      project: "Empty project",
    });
    const idle = mergeWidgetUpdate(cache(), push({}, []), now)!;
    expect(idle.snapshot.sessions).toEqual([]);
    expect(idle.sessions[0].title).toBe("Opt-in title");
    const next = push({ at: now + 1000 });
    expect(mergeWidgetUpdate(idle, next, now + 1000)!.snapshot.sessions[0].title).toBe(
      "Opt-in title",
    );
  });
  it("rejects other computers, duplicates, delayed and future updates", () => {
    expect(mergeWidgetUpdate(cache(), { ...push(), environmentId: "other" }, now)).toBeNull();
    for (const at of [now - 1000, now - 700_000, now + 61_000])
      expect(mergeWidgetUpdate(cache(), push({ at }), now)).toBeNull();
    const first = mergeWidgetUpdate(cache(), push(), now)!;
    expect(mergeWidgetUpdate(first, push(), now)).toBeNull();
  });
  it("never resurrects locked or signed-out content, even with opt-in cached text", () => {
    for (const changes of [
      { backgroundAllowed: false },
      { snapshot: { ...cache().snapshot, state: "locked" as const } },
    ]) {
      const result = mergeWidgetUpdate({ ...cache(), ...changes }, push(), now)!;
      expect(result.snapshot.state).toBe("locked");
      expect(result.snapshot.sessions).toEqual([]);
    }
  });
  it("clears resolved questions without reusing old occurrence text and handles partial lists honestly", () => {
    const stored = cache();
    stored.sessions[0] = {
      ...stored.sessions[0],
      needsInput: true,
      questionPrompt: "Old question",
    } as (typeof stored.sessions)[0];
    const result = mergeWidgetUpdate(
      stored,
      push({}, [{ id: "s", projectId: "p", kind: "done", status: "idle", updatedAt: now }]),
      now,
    )!;
    expect(result.snapshot.counts.needsInput).toBe(0);
    expect(result.sessions[0].questionPrompt).toBeUndefined();
    expect(mergeWidgetUpdate(cache(), push({ complete: false }), now)!.snapshot.stale).toBe(true);
  });
  it("rejects malformed, oversized, duplicate and unknown enum payloads", () => {
    for (const widget of [
      "{",
      "x".repeat(3501),
      JSON.stringify({ v: 2 }),
      JSON.stringify({
        v: 1,
        at: now,
        complete: true,
        sessions: [{ id: "s", projectId: "p", kind: "bogus", status: "running", updatedAt: now }],
      }),
    ])
      expect(parseWidgetUpdate({ ...push(), widget })).toBeNull();
    const row = { id: "s", projectId: "p", kind: "question", status: "running", updatedAt: now };
    expect(parseWidgetUpdate(push({}, [row, row]))).toBeNull();
  });
});
