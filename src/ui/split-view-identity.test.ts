import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = source("../../app/session/[id].tsx");
const frame = source("./split-view.tsx");

it("uses the measured composer band to clear the tablet quick panel", () => {
  const keyboardFrame = source("../features/workspace/session-keyboard-frame.tsx");
  expect(route).toMatch(/overlay=\{\(bottomInset\) => <TabletQuickPanel bottomInset=\{bottomInset\}/);
  expect(keyboardFrame).toContain("{overlay(height ?? fallback)}");
  expect(keyboardFrame).toMatch(/onLayout=\{\(event\) => \{\s*const next = event\.nativeEvent\.layout\.height;\s*if \(Number\.isFinite\(next\) && next > 0\) reportComposerHeight\?\.\(next\)/);
});

/** #1292: crossing the tablet/split breakpoint must not move the open session to another parent. */
describe("session route keeps one tree across phone, tablet and split", () => {
  it("renders a single return that hosts the session in SplitView's detail slot", () => {
    expect(route.match(/\breturn\s*\(/g)).toHaveLength(1);
    expect(route.match(/<SplitView\b/g)).toHaveLength(1);
    expect(route.match(/detail=\{session\}/g)).toHaveLength(1);
  });

  it("does not branch the parent of the session on the layout", () => {
    expect(route).not.toMatch(/if\s*\(\s*!?split\s*\)/);
    expect(route).not.toMatch(/\{\s*tablet\s*\?\s*\(\s*<View/);
    // The session element is only ever referenced as the detail, never placed directly in a branch.
    expect(route.match(/(?<!detail=)\{session\}/g) ?? []).toHaveLength(0);
  });

  it("switches only the siblings (rail, list, split animation) and keeps the machine scope outermost", () => {
    expect(route).toMatch(/rail=\{tablet \? <TabletRail \/> : null\}/);
    expect(route).toMatch(/split \? \(\s*(\/\/[^\n]*\n\s*)?<ScreenChromeProvider>/);
    expect(route).toMatch(/\{split \? <Stack\.Screen options=\{\{ animation: "none" \}\} \/> : null\}/);
    expect(route.indexOf("<WorkspaceRouteScope machineId={machineId}>")).toBeLessThan(route.indexOf("<SplitView"));
    expect(route.match(/<WorkspaceRouteScope\b/g)).toHaveLength(1);
  });

  it("keeps the session identity keyed by machine, session, project and target turn only", () => {
    expect(route).toContain("key={`${active}:${id}:${projectId ?? \"\"}:${targetTurnId ?? \"\"}`}");
    expect(route.match(/<SessionScreen\b/g)).toHaveLength(1);
  });
});

describe("SplitView keeps the detail in a stable slot", () => {
  it("has one root with rail/list, optional hinge gap and detail, in that order", () => {
    const body = frame.slice(frame.indexOf("export function SplitView"));
    expect(body.match(/return\s*\(/g)).toHaveLength(1);
    const rail = body.indexOf("{rail ?? null}");
    const list = body.indexOf("{list ?");
    const hinge = body.indexOf("{vertical ?");
    const detail = body.indexOf("{detail}");
    expect(rail).toBeGreaterThan(-1);
    expect(rail).toBeLessThan(list);
    expect(list).toBeLessThan(hinge);
    expect(hinge).toBeLessThan(detail);
    expect(body.match(/\{detail\}/g)).toHaveLength(1);
  });

  it("lets the list and rail be omitted", () => {
    expect(frame).toMatch(/list\?: ReactNode/);
    expect(frame).toMatch(/rail\?: ReactNode/);
  });
});
