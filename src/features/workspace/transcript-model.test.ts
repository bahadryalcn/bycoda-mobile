import { describe, expect, it } from "vitest";
import {
  activityState,
  readableToolName,
  activitySummary,
  awaitingFirstOutput,
  canCollapseToolFailure,
  canContinueInterruptedTurn,
  TranscriptPresentation,
  isBlockStreaming,
  transcriptEntries,
  transcriptTailStamp,
  transcriptSenderName,
  toolResultTexts,
  isFoldedOwnerStop,
  pendingOutboxRows,
  bridgeDeliveredOutboxRows,
  DELIVERED_GRACE_MS,
  userDraftState,
  withoutOfferedInterruption,
} from "./transcript-model";
import type { Block } from "./wire";
const block = (id: string, role: Block["role"], fields: Partial<Block> = {}): Block => ({
  id,
  role,
  text: id,
  ...fields,
});
describe("readable transcript", () => {
  it("ignores earlier history even when prepending it regroups the last activity row", () => {
    const tail = block("latest", "tool", { tool: { output: "running" } });
    const visible = transcriptEntries([tail]);
    const prepended = transcriptEntries([block("older", "tool"), tail]);
    expect(prepended.at(-1)?.id).not.toBe(visible.at(-1)?.id);
    expect(transcriptTailStamp(prepended)).toBe(transcriptTailStamp(visible));
    const streamed = transcriptEntries([{ ...tail, tool: { output: "running now" } }]);
    expect(transcriptTailStamp(streamed)).not.toBe(transcriptTailStamp(visible));
    expect(transcriptTailStamp(transcriptEntries([tail, block("answer", "assistant")]))).not.toBe(transcriptTailStamp(visible));
    expect(transcriptTailStamp([])).toBeUndefined();
  });
  it("retains separate full outputs without repeating the command or the same result twice", () => {
    expect(
      toolResultTexts(
        block("cmd", "tool", { tool: { detail: "full\n output", output: "full\n output" } }),
      ),
    ).toEqual(["full\n output"]);
    expect(
      toolResultTexts(block("cmd", "tool", { tool: { detail: "cmd", output: "result" } })),
    ).toEqual(["result"]);
    expect(
      toolResultTexts(block("", "tool", { tool: { detail: "result", output: "result" } })),
    ).toEqual([]);
    expect(toolResultTexts(block("text", "assistant", { tool: { output: "hidden" } }))).toEqual([]);
  });
  it("folds a turn's completed activity into one work row and restores it in detailed view", () => {
    const source = [
      block("u", "user"),
      block("done", "tool", { tool: { status: "completed" } }),
      block("reason", "reasoning"),
      block("a", "assistant"),
    ];
    expect(
      transcriptEntries(source, "codex", { view: "messages", running: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["u", "work:done", "a"]);
    const work = transcriptEntries(source, "codex", { view: "messages", running: false })[1];
    expect(work?.kind === "activity" && work.blocks.map((item) => item.id)).toEqual(["done", "reason"]);
    expect(transcriptEntries(source, "codex", { view: "details", running: false })).toEqual(
      transcriptEntries(source, "codex"),
    );
    expect(source.map((item) => item.id)).toEqual(["u", "done", "reason", "a"]);
  });
  it("shows running actions live and folds them into the turn's work row once they stop", () => {
    const source = [
      block("old", "tool", { streaming: true }),
      block("u", "user"),
      block("active", "tool", { tool: { status: "in_progress" } }),
      block("draft", "user", { draft: true }),
    ];
    const active = transcriptEntries(source, undefined, { view: "messages", running: true });
    expect(active.map((entry) => entry.id)).toEqual(["work:old", "u", "activity:active", "draft"]);
    expect(
      transcriptEntries(source, undefined, { view: "messages", running: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["work:old", "u", "work:active", "draft"]);
    source[2] = { ...source[2]!, streaming: true, tool: { status: "completed" } };
    expect(
      transcriptEntries(source, undefined, { view: "messages", running: true }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["work:old", "u", "work:active", "draft"]);
  });
  it("never calls a stopped action completed", () => {
    const stopped = block("stopped", "tool", { streaming: true, tool: { status: "stopped" } });
    expect(activityState(stopped)).toBe("stopped");
    expect(activitySummary([stopped])).toMatchObject({
      running: false,
      completed: false,
      state: "stopped",
    });
  });
  it("suppresses stale Writing feedback for terminal records without hiding live prose", () => {
    for (const status of [
      "completed",
      "done",
      "success",
      "failed",
      "denied",
      "cancelled",
      "stopped",
    ]) {
      expect(isBlockStreaming(block(status, "tool", { streaming: true, tool: { status } }))).toBe(
        false,
      );
    }
    expect(
      isBlockStreaming(
        block("agent", "tool", { streaming: true, agentRun: { endedAt: 10 } } as Partial<Block>),
      ),
    ).toBe(false);
    expect(isBlockStreaming(block("notice", "system", { streaming: true, notice: "error" }))).toBe(
      false,
    );
    expect(isBlockStreaming(block("answer", "assistant", { streaming: true }))).toBe(true);
    expect(isBlockStreaming(block("answer", "assistant"))).toBe(false);
  });
  it("retains required decisions, user commands, files and error notices in messages view", () => {
    const source = [
      block("u", "user"),
      block("approval", "tool", { approval: { requestId: 1 } }),
      block("error", "system", { notice: "error" }),
      block("interrupt", "system", { notice: "interrupt" }),
      block("shell", "system", { shell: { command: "echo hello", exitCode: 0 } } as Partial<Block>),
      block("plan", "plan", { plan: { status: "ready" } } as Partial<Block>),
      block("file", "tool", { attachments: [{ name: "result.txt" }] } as Partial<Block>),
      block("failed", "tool", { tool: { status: "failed" } }),
    ];
    expect(
      transcriptEntries(source, undefined, { view: "messages", running: false }).map(
        (entry) => entry.id,
      ),
    ).toEqual(["u", "approval", "error", "interrupt", "shell", "plan", "file", "failed"]);
    expect(
      transcriptEntries(source, undefined, { view: "details", running: false }).at(-1)?.id,
    ).toBe("failed");
  });
  it("retains turn authorship when filtering out actions and ignores internal turn boundaries", () => {
    const source = [
      block("u", "user", { turnModel: { harness: "claude", id: "m", name: "Model" } }),
      block("active", "reasoning", { streaming: true }),
      block("internal", "user", { internal: true }),
      block("a", "assistant", { streaming: true }),
    ];
    const entries = transcriptEntries(source, "codex", { view: "messages", running: true });
    expect(entries.map((entry) => entry.author)).toEqual(["claude", "claude", "claude"]);
    expect(entries.map((entry) => entry.kind)).toEqual(["message", "activity", "message"]);
  });
  it("uses compact failure summaries only for tools without decision controls", () => {
    const failed = block("failed", "tool", { tool: { status: "failed" } });
    expect(canCollapseToolFailure(failed)).toBe(true);
    expect(canCollapseToolFailure({ ...failed, role: "assistant" })).toBe(false);
    expect(canCollapseToolFailure({ ...failed, approval: { requestId: 1 } } as Block)).toBe(false);
    expect(canCollapseToolFailure({ ...failed, taskList: { items: [] } } as unknown as Block)).toBe(
      false,
    );
    expect(canCollapseToolFailure({ ...failed, draft: true })).toBe(false);
    expect(canCollapseToolFailure(block("running", "tool", { tool: { status: "running" } }))).toBe(
      false,
    );
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
    ).toEqual({
      count: 1,
      title: "Edit chat.tsx",
      running: false,
      completed: true,
      state: "completed",
    });
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

describe("repeated system failures", () => {
  const fail = (id: string) => ({ id, role: "system", notice: "error", text: "archived" }) as import("./wire").Block;
  const user = (id: string) => ({ id, role: "user", text: id }) as import("./wire").Block;
  it("folds identical failures separated only by user messages into one counted card", () => {
    const entries = transcriptEntries([user("u1"), fail("f1"), user("u2"), fail("f2")]);
    expect(entries.map((entry) => entry.id)).toEqual(["u1", "u2", "f2"]);
    expect(entries.at(-1)).toMatchObject({ repeat: 2 });
  });
});

it("presents canonical transcript sender names while retaining raw authorship", () => {
  for (const [id, name] of [["claude", "Claude"], ["codex", "Codex"], ["opencode", "OpenCode"], ["Custom Agent", "Custom Agent"]]) {
    const entries = transcriptEntries([block("answer", "assistant")], id);
    expect(entries[0].author).toBe(id);
    expect(transcriptSenderName(entries[0].author)).toBe(name);
  }
  expect(transcriptSenderName()).toBe("bycoda");
  expect(transcriptSenderName("")).toBe("bycoda");
});

describe("messages view work rows", () => {
  it("starts a new work row for each sent turn but not for queued drafts", () => {
    const source = [
      block("u1", "user"),
      block("t1", "tool", { tool: { status: "completed" } }),
      block("a1", "assistant"),
      block("t2", "tool", { tool: { status: "completed" } }),
      block("u2", "user"),
      block("t3", "tool", { tool: { status: "completed" } }),
      block("q", "user", { draft: true }),
      block("t4", "tool", { tool: { status: "completed" } }),
    ];
    const entries = transcriptEntries(source, undefined, { view: "messages", running: false });
    expect(entries.map((entry) => entry.id)).toEqual(["u1", "work:t1", "a1", "u2", "work:t3", "q"]);
    expect(entries.map((entry) => (entry.kind === "activity" ? entry.blocks.length : 0))).toEqual([0, 2, 0, 0, 2, 0]);
  });
});

describe("turn chrome", () => {
  const opus = { harness: "claude" as const, id: "opus", name: "Opus" };
  const gpt = { harness: "codex" as const, id: "gpt", name: "GPT" };
  it("ends each settled turn with its receipt, but not the turn still running", () => {
    const source = [
      block("u1", "user", { durationMs: 1000, turnModel: opus }),
      block("a1", "assistant"),
      block("u2", "user", { turnModel: opus }),
      block("a2", "assistant"),
    ];
    const entries = transcriptEntries(source, undefined, { view: "messages", running: true });
    expect(entries.find((entry) => entry.id === "a1")?.footer?.id).toBe("u1");
    expect(entries.find((entry) => entry.id === "a2")?.footer).toBeUndefined();
    expect(entries.find((entry) => entry.id === "a1")?.modelName).toBe("Opus");
    const settled = transcriptEntries(
      source.map((item) => (item.id === "u2" ? { ...item, durationMs: 5 } : item)),
      undefined,
      { view: "messages", running: false },
    );
    expect(settled.at(-1)?.footer?.id).toBe("u2");
  });
  it("marks a model change between turns unless a switch row already said so", () => {
    const changed = transcriptEntries([
      block("u1", "user", { turnModel: opus }),
      block("a1", "assistant"),
      block("u2", "user", { turnModel: gpt }),
    ]);
    expect(changed.find((entry) => entry.id === "u2")?.modelChange).toEqual({ from: opus, to: gpt });
    const recorded = transcriptEntries(
      [
        block("u1", "user", { turnModel: opus }),
        block("switch", "system", {
          modelSwitch: {
            steps: [
              { harness: "claude", model: "Opus", at: 1 },
              { harness: "codex", model: "GPT", at: 2 },
            ],
          },
        }),
        block("u2", "user", { turnModel: gpt }),
      ],
      undefined,
      { view: "messages", running: false },
    );
    expect(recorded.map((entry) => entry.id)).toEqual(["u1", "switch", "u2"]);
    expect(recorded.find((entry) => entry.id === "u2")?.modelChange).toBeUndefined();
  });
  it("keeps the model change and earlier receipt when only the new turn is regrouped", () => {
    const presentation = new TranscriptPresentation();
    const first = [block("u1", "user", { turnModel: opus, durationMs: 1 }), block("a1", "assistant")];
    presentation.update(first, undefined, { view: "messages", running: false });
    const entries = presentation.update([...first, block("u2", "user", { turnModel: gpt })], undefined, {
      view: "messages",
      running: true,
    });
    expect(entries.find((entry) => entry.id === "u2")?.modelChange?.to).toEqual(gpt);
    expect(entries.find((entry) => entry.id === "a1")?.footer?.id).toBe("u1");
  });
  it("waits for the first readable output of the running turn", () => {
    expect(awaitingFirstOutput([block("u", "user")])).toBe(true);
    expect(awaitingFirstOutput([block("u", "user"), block("r", "reasoning", { text: "" })])).toBe(true);
    expect(awaitingFirstOutput([block("u", "user"), block("s", "system")])).toBe(true);
    expect(awaitingFirstOutput([block("u", "user"), block("a", "assistant")])).toBe(false);
    expect(awaitingFirstOutput([block("u", "user"), block("t", "tool", { text: "" })])).toBe(false);
    expect(awaitingFirstOutput([])).toBe(false);
  });
  it("offers Continue only for a turn cut off without the owner stopping it", () => {
    const session = (blocks: Block[], status: "idle" | "running" | "interrupted" = "idle") => ({
      status,
      session: { blocks },
    });
    const cut = block("n", "system", { notice: "interrupt", text: "Turn interrupted." });
    expect(canContinueInterruptedTurn(session([block("u", "user"), cut]))).toBe(true);
    expect(canContinueInterruptedTurn(session([block("u", "user"), cut], "running"))).toBe(false);
    expect(
      canContinueInterruptedTurn(session([block("u", "user"), block("a", "assistant")], "interrupted")),
    ).toBe(true);
    expect(
      canContinueInterruptedTurn(
        session([block("u", "user"), block("s", "system", { text: "Stopped by you." })], "interrupted"),
      ),
    ).toBe(false);
    expect(canContinueInterruptedTurn(session([block("u", "user"), block("a", "assistant")]))).toBe(false);
  });
});

describe("readable tool names", () => {
  it("drops the MCP server prefix and underscores", () => {
    expect(readableToolName("mcp__workspace-tools__delegate_task")).toBe("delegate task");
    expect(readableToolName("Read file")).toBe("Read file");
  });
});

describe("transcript presentation sharing", () => {
  it("keeps unchanged live-turn entries' identity while one block streams", () => {
    const presentation = new TranscriptPresentation();
    const user = block("u1", "user");
    const tools = [block("t1", "tool", { tool: { title: "Read", status: "completed" } }), block("t2", "tool", { tool: { title: "Edit", status: "completed" } })];
    const answer = block("a1", "assistant", { text: "Hel" });
    const before = presentation.update([user, ...tools, answer], undefined, { view: "messages", running: true });
    const after = presentation.update([user, ...tools, { ...answer, text: "Hello" }], undefined, { view: "messages", running: true });
    expect(after.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
    expect(after.slice(0, -1)).toEqual(before.slice(0, -1));
    after.slice(0, -1).forEach((entry, index) => expect(entry).toBe(before[index]));
    expect(after.at(-1)).not.toBe(before.at(-1));
    const last = after.at(-1);
    expect(last?.kind === "message" ? last.block.text : "").toBe("Hello");
  });
  it("rebuilds an activity entry whose blocks grew", () => {
    const presentation = new TranscriptPresentation();
    const user = block("u1", "user");
    const t1 = block("t1", "tool", { tool: { title: "Read", status: "completed" } });
    const before = presentation.update([user, t1], undefined, { view: "messages", running: true });
    const after = presentation.update([user, t1, block("t2", "tool", { tool: { title: "Edit", status: "completed" } })], undefined, { view: "messages", running: true });
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1]?.kind === "activity" ? after[1].blocks.length : 0).toBe(2);
  });
});

describe("quiet transcript (chat redesign)", () => {
  const stop = block("stop", "system", { notice: "interrupt", text: "Stopped by you." });
  it("folds the owner's Stop notice and a quit marker after it out of the messages view only", () => {
    const source = [
      block("u1", "user", { durationMs: 46_000, turnOutcome: "stopped" }),
      block("a1", "assistant"),
      stop,
      block("quit", "system", { notice: "interrupt", text: "Turn interrupted when bycoda quit." }),
    ];
    const messages = transcriptEntries(source, undefined, { view: "messages", running: false });
    expect(messages.map((entry) => entry.id)).toEqual(["u1", "a1"]);
    expect(messages.at(-1)?.footer?.id).toBe("u1");
    const details = transcriptEntries(source, undefined, { view: "details", running: false });
    expect(details.map((entry) => entry.id)).toContain("stop");
    expect(isFoldedOwnerStop(undefined, stop)).toBe(true);
    expect(isFoldedOwnerStop(block("a", "assistant"), block("cut", "system", { notice: "interrupt", text: "Connection lost." }))).toBe(false);
  });
  it("puts a settled turn's duration on its fold row, and on the receipt only without one", () => {
    const folded = transcriptEntries(
      [
        block("u1", "user", { durationMs: 46_000 }),
        block("t1", "tool", { tool: { title: "Read", status: "completed" } }),
        block("a1", "assistant"),
      ],
      undefined,
      { view: "messages", running: false },
    );
    const work = folded.find((entry) => entry.kind === "activity");
    expect(work?.foldTurn?.id).toBe("u1");
    expect(folded.at(-1)?.footer?.id).toBe("u1");
    expect(folded.at(-1)?.footerDuration).toBeUndefined();
    const plain = transcriptEntries([block("u1", "user", { durationMs: 3000 }), block("a1", "assistant")], undefined, {
      view: "messages",
      running: false,
    });
    expect(plain.at(-1)?.footerDuration).toBe(true);
    const live = transcriptEntries(
      [block("u1", "user", { durationMs: 1 }), block("t1", "tool", { tool: { title: "Read", status: "completed" } })],
      undefined,
      { view: "messages", running: true },
    );
    expect(live.find((entry) => entry.kind === "activity")?.foldTurn).toBeUndefined();
  });
  it("names host follow-up delivery states apart from saved drafts", () => {
    expect(userDraftState(block("d", "user", { draft: true, followUpDelivery: "pending" }))).toBe("pending");
    expect(userDraftState(block("d", "user", { draft: true, followUpDelivery: "uncertain" }))).toBe("uncertain");
    expect(userDraftState(block("d", "user", { draft: true }))).toBe("saved");
    expect(userDraftState(block("d", "user"))).toBeUndefined();
  });
  it("drops the trailing interruption notice the footer's Continue stands for, keeping its receipt", () => {
    const entries = transcriptEntries(
      [block("u1", "user", { durationMs: 5 }), block("a1", "assistant"), block("cut", "system", { notice: "interrupt", text: "Connection lost." })],
      undefined,
      { view: "messages", running: false },
    );
    const shown = withoutOfferedInterruption(entries);
    expect(shown.map((entry) => entry.id)).toEqual(["u1", "a1"]);
    expect(shown.at(-1)?.footer?.id).toBe("u1");
    const settled = transcriptEntries([block("u1", "user"), block("a1", "assistant")]);
    expect(withoutOfferedInterruption(settled)).toBe(settled);
  });
  it("reconciles outbox rows with Host blocks by command id, never by text", () => {
    const now = 1_000_000;
    const id = "0F8FAD5B-D9CB-469F-A165-70867728950E";
    const rows = [
      { id, status: "waiting", createdAt: now - 1000 },
      { id: "b", status: "waiting", createdAt: now - 1000 },
      { id: "c", status: "delivered", createdAt: now - 1000 },
      { id: "d", status: "delivered", createdAt: now - 600_000 },
    ];
    const blocks = [block(id.toLowerCase(), "user", { text: "same text" }), block("other", "user", { text: "b" })];
    expect(pendingOutboxRows(rows, blocks, now).map((row) => row.id)).toEqual(["b", "c"]);
    expect(pendingOutboxRows(rows, [...blocks, block("c", "user")], now).map((row) => row.id)).toEqual(["b"]);
  });
  it("keeps the owner's Stop as one compact row when no stopped receipt will say it", () => {
    const quit = block("quit", "system", { notice: "interrupt", text: "Turn interrupted when bycoda quit." });
    // No duration: the turn gets no receipt, so the Stop stays and only the quit marker folds.
    const bare = transcriptEntries([block("u1", "user"), block("a1", "assistant"), stop, quit], undefined, {
      view: "messages",
      running: false,
    });
    expect(bare.map((entry) => entry.id)).toEqual(["u1", "a1", "stop"]);
    // A receipt that does not say "stopped" does not stand for the Stop either.
    const worked = transcriptEntries(
      [block("u1", "user", { durationMs: 5 }), block("a1", "assistant"), stop],
      undefined,
      { view: "messages", running: false },
    );
    expect(worked.map((entry) => entry.id)).toEqual(["u1", "a1", "stop"]);
    // The running last turn has no receipt yet.
    const live = transcriptEntries(
      [block("u1", "user", { durationMs: 5, turnOutcome: "stopped" }), block("a1", "assistant"), stop],
      undefined,
      { view: "messages", running: true },
    );
    expect(live.map((entry) => entry.id)).toEqual(["u1", "a1", "stop"]);
    // An earlier stopped turn closed by the next prompt keeps its receipt, so its Stop folds.
    const earlier = transcriptEntries(
      [block("u1", "user", { durationMs: 5, turnOutcome: "stopped" }), block("a1", "assistant"), stop, block("u2", "user")],
      undefined,
      { view: "messages", running: true },
    );
    expect(earlier.map((entry) => entry.id)).toEqual(["u1", "a1", "u2"]);
    expect(earlier[1]?.footer?.id).toBe("u1");
  });
  it("names a reply's agent only when it is not the session's agent or follows another agent's reply", () => {
    const turn = (id: string, harness: "claude" | "codex") => block(id, "user", { turnModel: { harness, id: harness, name: harness } });
    const names = (entries: ReturnType<typeof transcriptEntries>) =>
      entries.filter((entry) => entry.kind === "message" && entry.block.role === "assistant").map((entry) => !!entry.showAuthor);
    const single = transcriptEntries(
      [turn("u1", "claude"), block("a1", "assistant"), block("a2", "assistant"), turn("u2", "claude"), block("a3", "assistant")],
      "claude",
      { view: "messages", running: false },
    );
    expect(names(single)).toEqual([false, false, false]);
    const crew = transcriptEntries(
      [turn("u1", "claude"), block("a1", "assistant"), turn("u2", "codex"), block("a2", "assistant"), block("a3", "assistant"), turn("u3", "claude"), block("a4", "assistant")],
      "claude",
      { view: "messages", running: false },
    );
    // A helper's reply is named (not continuations of it); the lead's reply after it is named again.
    expect(names(crew)).toEqual([false, true, false, true]);
    // Incremental regrouping keeps the session's agent and the previous reply's author.
    const presentation = new TranscriptPresentation();
    const base = [turn("u1", "codex"), block("a1", "assistant"), turn("u2", "claude"), block("a2", "assistant")];
    const before = presentation.update(base, "claude", { view: "messages", running: false });
    const next = presentation.update([...base, turn("u3", "claude"), block("a3", "assistant")], "claude", { view: "messages", running: false });
    expect(next[0]).toBe(before[0]);
    expect(names(next)).toEqual([true, true, false]);
  });
  it("bridges a delivered outbox row custody removed until the Host block arrives or the grace ends", () => {
    const now = 5_000_000;
    const remembered = new Map<string, { id: string; status: string; createdAt: number; mode?: string; deliveredAt?: number }>();
    const waiting = { id: "w", status: "waiting", createdAt: now - 100, mode: "send" };
    const sent = { id: "S", status: "delivered", createdAt: now - 400_000, mode: "send" };
    const queued = { id: "q", status: "delivered", createdAt: now - 300_000, mode: "queue" };
    // Seen delivered once: the grace counts from that sighting, not from createdAt.
    const first = bridgeDeliveredOutboxRows(remembered, [waiting, sent, queued], now);
    expect(pendingOutboxRows(first, [], now).map((row) => row.id)).toEqual(["w", "S"]);
    // Custody removed it; the bubble stays, in sending order, while no Host block has the id.
    const later = now + 1000;
    const removed = bridgeDeliveredOutboxRows(remembered, [waiting], later);
    expect(pendingOutboxRows(removed, [], later).map((row) => row.id)).toEqual(["S", "w"]);
    expect(pendingOutboxRows(removed, [block("s", "user")], later).map((row) => row.id)).toEqual(["w"]);
    // The grace ends the bridge and forgets the row.
    const expired = now + DELIVERED_GRACE_MS;
    expect(pendingOutboxRows(bridgeDeliveredOutboxRows(remembered, [waiting], expired), [], expired).map((row) => row.id)).toEqual(["w"]);
    expect(remembered.size).toBe(0);
  });
});
