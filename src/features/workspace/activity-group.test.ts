import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Block } from "./wire";

vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/chat-activity", () => ({
  ChatActivity: ({ status, detail }: { status: string; detail: string }) =>
    createElement("button", { "data-status": status }, detail),
}));
import { ActivityGroup } from "./activity-group";

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
});
