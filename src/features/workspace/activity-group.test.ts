import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Block } from "./wire";

vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("lucide-react-native/icons/terminal", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => ({
  NavigationRow: ({ detail }: { detail: string }) => createElement("button", { "data-navigation-row": true }, detail),
  RowIcon: () => null,
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, string | number>) =>
    en.replace(/\{(p\d+)\}/g, (_: string, key: string) => String(values?.[key])),
}));
vi.mock("@/ui/chat-activity", () => ({
  ChatActivity: ({ status, detail, title }: { status: string; detail: string; title: string }) =>
    createElement("button", { "data-status": status, "data-title": title }, detail),
}));
import { ActivityGroup, stepDelta } from "./activity-group";

const action = (id: string, status?: string): Block => ({
  id,
  role: "tool",
  text: id,
  tool: { status },
});
const render = (blocks: Block[], live = false) =>
  renderToStaticMarkup(createElement(ActivityGroup, { blocks, live, onInspect: vi.fn() }));

describe("activity group state presentation", () => {
  it("retains interruption when a settled group also contains completed work", () => {
    expect(render([action("finished", "completed"), action("interrupted", "stopped")])).toContain(
      'data-status="stopped"',
    );
  });
  it("does not imply completion or pending work for an unknown or stale running record", () => {
    expect(render([action("unclassified")])).toContain('data-status="record"');
    expect(render([action("old", "running")])).toContain('data-status="record"');
    expect(render([action("active", "running")], true)).toContain('data-status="running"');
    expect(
      render([
        action("finished", "completed"),
        { id: "reason", role: "reasoning", text: "Thinking", streaming: true },
      ]),
    ).toContain('data-status="record"');
  });
  it("shows completion only when all tool records completed", () => {
    expect(render([action("first", "completed"), action("second", "done")])).toContain(
      'data-status="complete"',
    );
    expect(render([action("first", "completed"), action("unknown")])).toContain(
      'data-status="record"',
    );
  });
  it("does not conceal a failed command when a later command is still running", () => {
    const html = render([action("failed", "failed"), action("active", "running")], true);
    expect(html).toContain('data-status="error"');
    expect(html).toContain("Working");
  });
  it("summarizes the work like desktop instead of counting actions", () => {
    const html = render([
      { id: "r", role: "tool", text: "Read a.ts", tool: { kind: "read", status: "completed" } },
      { id: "x", role: "tool", text: "pnpm test", tool: { kind: "execute", status: "completed" } },
    ]);
    expect(html).toContain('data-title="Read a.ts · Ran a command"');
  });
});

describe("settled fold row", () => {
  it("reads Worked for the turn's duration, keeping what the work was for the spoken detail", () => {
    const turn: Block = { id: "u", role: "user", text: "go", durationMs: 46_000 };
    const html = renderToStaticMarkup(
      createElement(ActivityGroup, { blocks: [action("a", "completed")], live: false, turn, onInspect: vi.fn() }),
    );
    expect(html).toContain('data-title="Worked for 46 s"');
    const running = renderToStaticMarkup(
      createElement(ActivityGroup, { blocks: [action("a", "running"), action("b", "running")], live: true, turn, onInspect: vi.fn() }),
    );
    expect(running).not.toContain("Worked for");
  });
  it("sums a step's added and removed lines from its file changes", () => {
    expect(stepDelta({ id: "e", role: "tool", text: "", tool: { fileChanges: [
      { path: "a.ts", counts: { additions: 3, deletions: 1 } },
      { path: "b.ts", counts: { additions: 2, deletions: 0 } },
    ] as never } })).toEqual({ added: 5, removed: 1 });
    expect(stepDelta({ id: "e", role: "tool", text: "", tool: { fileChanges: [{ path: "a.ts" }] as never } })).toBeUndefined();
    expect(stepDelta(undefined)).toBeUndefined();
  });
});
