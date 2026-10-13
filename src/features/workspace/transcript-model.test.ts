import { describe, expect, it } from "vitest";
import { activityState, activitySummary, transcriptEntries } from "./transcript-model";
import type { Block } from "./wire";
const block = (id: string, role: Block["role"], fields: Partial<Block> = {}): Block => ({
  id,
  role,
  text: id,
  ...fields,
});
describe("readable transcript", () => {
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
