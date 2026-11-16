import { describe, expect, it } from "vitest";
import { workOrbState, workSteps, workSummaryLine } from "./work-summary";
import type { Block } from "./wire";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{(p\d+)\}/g, (_, key: string) => String(values?.[key]));
const tool = (id: string, value: Block["tool"], text = ""): Block => ({ id, role: "tool", text, tool: value });

describe("work summary", () => {
  it("adds up a run of work in the order it happened", () => {
    const steps = [
      tool("r1", { kind: "read", status: "completed", preview: { kind: "read", path: "src/a.ts" } }),
      tool("r2", { kind: "read", status: "completed", preview: { kind: "read", path: "src/b.ts" } }),
      tool("e1", { kind: "edit", status: "completed", preview: { kind: "write", path: "src/a.ts" } }),
      tool("x1", { kind: "execute", status: "completed" }, "pnpm test"),
    ];
    expect(workSummaryLine(steps, copy)).toBe("Read 2 files · Edited a.ts · Ran a command");
  });
  it("keeps the call in flight present tense while live", () => {
    const steps = [
      tool("x1", { kind: "execute", status: "completed" }),
      tool("x2", { kind: "execute", status: "running" }),
    ];
    expect(workSummaryLine(steps, copy, true)).toBe("Running 2 commands");
    expect(workSummaryLine(steps, copy)).toBe("Ran 2 commands");
  });
  it("names searches, subagents, other tools, notes and thought-only groups", () => {
    expect(workSummaryLine([tool("s", { kind: "search", status: "completed" })], copy)).toBe(
      "Searched the project",
    );
    expect(workSummaryLine([tool("a", { kind: "agent", status: "completed" })], copy)).toBe("Ran a subagent");
    expect(
      workSummaryLine([tool("m", { kind: "mcp", status: "completed" }), tool("n", { kind: "mcp" })], copy),
    ).toBe("Ran 2 tools");
    expect(workSummaryLine([{ id: "r", role: "reasoning", text: "hmm" }], copy)).toBe("Thought");
    expect(workSummaryLine([{ id: "r", role: "reasoning", text: "hmm" }], copy, true)).toBe("Thinking");
    expect(
      workSummaryLine(
        [{ id: "s", role: "system", text: "note", interjection: {} as NonNullable<Block["interjection"]> }],
        copy,
      ),
    ).toBe("1 note");
    expect(workSummaryLine([{ id: "s", role: "system", text: "Advisor reviewed" }], copy)).toBe(
      "Status update",
    );
  });
  it("classifies untyped tools by their title", () => {
    expect(workSummaryLine([tool("g", { status: "completed" }, "Grep foo")], copy)).toBe(
      "Searched the project",
    );
    expect(workSummaryLine([tool("b", { status: "completed" }, "Bash ls")], copy)).toBe("Ran a command");
  });
});
describe("work steps", () => {
  it("names each step with a verb and its target", () => {
    const steps = workSteps(
      [
        { id: "r", role: "tool", text: "Read src/calendar/index.tsx", tool: { kind: "read", status: "completed", preview: { kind: "read", path: "src/calendar/index.tsx" } } },
        { id: "s", role: "tool", text: "grep openStart", tool: { kind: "search", status: "completed", preview: { kind: "search", query: "openStart" } } },
        { id: "x", role: "tool", text: "pnpm test", tool: { kind: "execute", status: "failed" } },
        { id: "t", role: "reasoning", text: "Rewriting the band\nmore" },
      ],
      copy,
    );
    expect(steps).toEqual([
      { id: "r", label: "Opened", file: "index.tsx", text: undefined, state: "done" },
      { id: "s", label: "Searched", code: "openStart", state: "done" },
      { id: "x", label: "Ran", code: "pnpm test", state: "failed" },
      { id: "t", label: "Thought", text: "Rewriting the band", state: "done" },
    ]);
  });
  it("keeps present tense only for a live running step", () => {
    const block: Block = { id: "e", role: "tool", text: "Edit a.ts", tool: { kind: "edit", status: "running" } };
    expect(workSteps([block], copy, true)[0]).toMatchObject({ label: "Editing", file: "a.ts", state: "running" });
    expect(workSteps([block], copy, false)[0]).toMatchObject({ label: "Edited", state: "done" });
  });
});

describe("work orb state", () => {
  const block = (kind: string, status = "running"): Block => ({ id: kind, role: "tool", text: "", tool: { kind, status } });
  it("names the kind of busy from the step in flight", () => {
    expect(workOrbState([block("read")])).toBe("searching");
    expect(workOrbState([block("read", "completed"), block("edit")])).toBe("shaping");
    expect(workOrbState([block("execute")])).toBe("working");
    expect(workOrbState([{ id: "t", role: "reasoning", text: "", streaming: true }])).toBe("solving");
    expect(workOrbState([block("read", "completed")])).toBe("working");
  });
});
