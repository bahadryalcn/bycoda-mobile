import { describe, expect, it } from "vitest";
import { activityState, activitySummary, canCollapseToolFailure, transcriptEntries, toolResultTexts } from "./transcript-model";
import type { Block } from "./wire";
const block = (id: string, role: Block["role"], fields: Partial<Block> = {}): Block => ({
  id,
  role,
  text: id,
  ...fields,
});
describe("readable transcript", () => {
  it("retains separate full outputs without repeating the command or the same result twice", () => {
    expect(toolResultTexts(block("cmd", "tool", { tool: { detail: "full\n output", output: "full\n output" } })))
      .toEqual(["full\n output"]);
    expect(toolResultTexts(block("cmd", "tool", { tool: { detail: "cmd", output: "result" } })))
      .toEqual(["result"]);
    expect(toolResultTexts(block("", "tool", { tool: { detail: "result", output: "result" } }))).toEqual([]);
    expect(toolResultTexts(block("text", "assistant", { tool: { output: "hidden" } }))).toEqual([]);
  });
  it("removes completed activity without deleting history and restores it in detailed view", () => {
    const source = [block("u", "user"), block("done", "tool", { tool: { status: "completed" } }),
      block("reason", "reasoning"), block("a", "assistant")];
    expect(transcriptEntries(source, "codex", { view: "messages", running: false }).map((entry) => entry.id))
      .toEqual(["u", "a"]);
    expect(transcriptEntries(source, "codex", { view: "details", running: false }))
      .toEqual(transcriptEntries(source, "codex"));
    expect(source.map((item) => item.id)).toEqual(["u", "done", "reason", "a"]);
  });
  it("shows only currently running actions and hides them on completion or session stop", () => {
    const source = [block("old", "tool", { streaming: true }), block("u", "user"),
      block("active", "tool", { tool: { status: "in_progress" } }),
      block("draft", "user", { draft: true })];
    const active = transcriptEntries(source, undefined, { view: "messages", running: true });
    expect(active.map((entry) => entry.id)).toEqual(["u", "activity:active", "draft"]);
    expect(transcriptEntries(source, undefined, { view: "messages", running: false }).map((entry) => entry.id))
      .toEqual(["u", "draft"]);
    source[2] = { ...source[2]!, streaming: true, tool: { status: "completed" } };
    expect(transcriptEntries(source, undefined, { view: "messages", running: true }).map((entry) => entry.id))
      .toEqual(["u", "draft"]);
  });
  it("never calls a stopped action completed", () => {
    const stopped = block("stopped", "tool", { streaming: true, tool: { status: "stopped" } });
    expect(activityState(stopped)).toBe("stopped");
    expect(activitySummary([stopped])).toMatchObject({ running: false, completed: false });
  });
  it("retains required decisions, user commands, files and error notices in messages view", () => {
    const source = [block("u", "user"), block("approval", "tool", { approval: { requestId: 1 } }),
      block("error", "system", { notice: "error" }), block("interrupt", "system", { notice: "interrupt" }),
      block("shell", "system", { shell: { command: "echo hello", exitCode: 0 } } as Partial<Block>),
      block("plan", "plan", { plan: { status: "ready" } } as Partial<Block>),
      block("file", "tool", { attachments: [{ name: "result.txt" }] } as Partial<Block>),
      block("failed", "tool", { tool: { status: "failed" } })];
    expect(transcriptEntries(source, undefined, { view: "messages", running: false }).map((entry) => entry.id))
      .toEqual(["u", "approval", "error", "interrupt", "shell", "plan", "file"]);
    expect(transcriptEntries(source, undefined, { view: "details", running: false }).at(-1)?.id).toBe("failed");
  });
  it("retains turn authorship when filtering out actions and ignores internal turn boundaries", () => {
    const source = [block("u", "user", { turnModel: { harness: "claude", id: "m", name: "Model" } }),
      block("active", "reasoning", { streaming: true }), block("internal", "user", { internal: true }),
      block("a", "assistant", { streaming: true })];
    const entries = transcriptEntries(source, "codex", { view: "messages", running: true });
    expect(entries.map((entry) => entry.author)).toEqual(["claude", "claude", "claude"]);
    expect(entries.map((entry) => entry.kind)).toEqual(["message", "activity", "message"]);
  });
  it("uses compact failure summaries only for tools without decision controls", () => {
    const failed = block("failed", "tool", { tool: { status: "failed" } });
    expect(canCollapseToolFailure(failed)).toBe(true);
    expect(canCollapseToolFailure({ ...failed, role: "assistant" })).toBe(false);
    expect(canCollapseToolFailure({ ...failed, approval: { requestId: 1 } } as Block)).toBe(false);
    expect(canCollapseToolFailure({ ...failed, taskList: { items: [] } } as unknown as Block)).toBe(false);
    expect(canCollapseToolFailure({ ...failed, draft: true })).toBe(false);
    expect(canCollapseToolFailure(block("running", "tool", { tool: { status: "running" } }))).toBe(false);
  });
  it("groups consecutive quiet activity without changing chronology", () => {
    const source = [
      block("u", "user"),
      block("t", "tool"),
      block("r", "reasoning"),
      block("s", "system"),
      block("a", "assistant"),
    ];
    const entries = transcriptEntries(source);
    expect(entries.map((entry) => entry.kind)).toEqual(["message", "activity", "message"]);
    expect(entries[1]?.kind === "activity" && entries[1].blocks.map((item) => item.id)).toEqual([
      "t",
      "r",
      "s",
    ]);
    expect(source.map((item) => item.id)).toEqual(["u", "t", "r", "s", "a"]);
  });
  it("keeps approvals, errors, plans, tasks and drafts visible", () => {
    const rows = [
      block("approval", "tool", { approval: { requestId: 1 } }),
      block("error", "system", { notice: "error" }),
      block("failed", "tool", { tool: { status: "failed" } }),
      block("plan", "plan", { plan: { status: "ready" } }),
      block("tasks", "tasks", { taskList: { items: [] } }),
      block("draft", "user", { draft: true }),
      block("internal", "user", { internal: true }),
    ];
    expect(transcriptEntries(rows).map((entry) => entry.id)).toEqual([
      "approval",
      "error",
      "failed",
      "plan",
      "tasks",
      "draft",
    ]);
    expect(transcriptEntries(rows).every((entry) => entry.kind === "message")).toBe(true);
  });
  it("retains each turn's provider when a session changes agents", () => {
    const rows = [
      block("u1", "user", { turnModel: { harness: "claude", id: "m1", name: "Model 1" } }),
      block("a1", "assistant"),
      block("u2", "user", { turnModel: { harness: "codex", id: "m2", name: "Model 2" } }),
      block("a2", "assistant"),
    ];
    expect(transcriptEntries(rows, "codex").map((entry) => entry.author)).toEqual([
      "claude",
      "claude",
      "codex",
      "codex",
    ]);
  });
  it("keeps attachments and rejected actions out of quiet activity", () => {
    const rows = [
      block("t", "tool"),
      block("image", "system", {
        image: {
          name: "screen.png",
          path: "/fixture/screen.png",
          size: 100,
          mimeType: "image/png",
        },
      }),
      block("rejected", "tool", { tool: { status: "rejected" } }),
      block("t2", "tool"),
    ];
    expect(transcriptEntries(rows).map((entry) => entry.kind)).toEqual([
      "activity",
      "message",
      "message",
      "activity",
    ]);
  });
  it("names the latest tool instead of an unrelated system ping", () => {
    expect(
      activitySummary([
        block("tool", "tool", { tool: { title: "Edit chat.tsx", status: "completed" } }),
        block("system", "system", { text: "Synthetic review finished" }),
      ]),
    ).toEqual({ count: 1, title: "Edit chat.tsx", running: false, completed: true });
  });
  it("shows the active agent assignment and never invents completion", () => {
    const active = block("agent", "tool", {
      tool: { title: "Agent", status: "running" },
      agentRun: { name: "UI review", prompt: "Review the chat", steps: [] },
    });
    expect(
      activitySummary([
        active,
        block("later", "tool", { tool: { title: "Read file", status: "completed" } }),
      ]),
    ).toMatchObject({ title: "UI review", running: true, completed: false });
    expect(activitySummary([block("unknown", "tool")]).completed).toBe(false);
    expect(
      activityState(block("failed", "tool", { streaming: true, tool: { status: "failed" } })),
    ).toBe("failed");
  });
});
