import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import type { ChildSessionEntry } from "./subagent-sessions-model";
import { delegateCall, delegatedRunBlock, delegationToolKind, placeDelegatedRuns } from "./delegated-runs-model";
import { subagentRunView } from "./subagent-run-model";
import { transcriptEntries } from "./transcript-model";

const tool = (id: string, title: string, detail?: string, extra: Partial<Block> = {}): Block =>
  ({ id, role: "tool", text: title, tool: { title, status: "completed", ...(detail !== undefined ? { detail } : {}) }, ...extra });
const child = (sessionId: string, extra: Partial<ChildSessionEntry> = {}): ChildSessionEntry =>
  ({ sessionId, projectId: "p", title: `Child ${sessionId}`, kind: "subagent", state: "running", startedAt: 100, meta: "", ...extra });

describe("bycoda delegate calls", () => {
  it("recognizes the agents tools by title, preview title or text", () => {
    expect(delegationToolKind(tool("a", "bycoda-conversation:conversation_agents_delegate"))).toBe("delegate");
    expect(delegationToolKind(tool("b", "agents.wait"))).toBe("wait");
    expect(delegationToolKind({ id: "p", role: "tool", text: "", tool: { title: "Read grok:grok-4", preview: { title: "mcp:agents_reply" } } } as unknown as Block)).toBe("reply");
    expect(delegationToolKind(tool("c", "agents.list"))).toBeUndefined();
    expect(delegationToolKind({ role: "assistant", text: "agents.delegate" } as Block)).toBeUndefined();
  });

  it("reads child ids from a single or multi-run result and survives a truncated one", () => {
    expect(delegateCall(tool("a", "agents.delegate", JSON.stringify({ sessionId: "c1" })))).toEqual({ kind: "delegate", sessionIds: ["c1"] });
    expect(delegateCall(tool("b", "agents.wait", JSON.stringify({ runs: [{ sessionId: "c1" }, { sessionId: "c2" }, { status: "x" }] }))))
      .toEqual({ kind: "wait", sessionIds: ["c1", "c2"] });
    expect(delegateCall(tool("c", "agents.delegate", '{"sessionId":"c1","sta'))).toEqual({ kind: "delegate", sessionIds: [] });
    expect(delegateCall(tool("d", "agents.delegate"))).toEqual({ kind: "delegate", sessionIds: [] });
    expect(delegateCall(tool("e", "agents.consult", JSON.stringify({ sessionId: "c1" })))).toBeUndefined();
  });
});

describe("delegated runs in the transcript", () => {
  const user: Block = { id: "u", role: "user", text: "go" };
  const start = tool("t1", "agents.delegate", JSON.stringify({ sessionId: "c1" }), { startedAt: 90 });
  const wait = tool("t2", "agents.wait", JSON.stringify({ runs: [{ sessionId: "c1" }] }));
  const other = tool("t3", "agents.delegate", JSON.stringify({ sessionId: "unknown" }));

  it("turns a listed child's delegate call into its row and drops its wait", () => {
    const placed = placeDelegatedRuns([user, start, wait, other], [child("c1")]);
    expect(placed.map((block) => block.id)).toEqual(["u", "delegated:c1", "t3"]);
    const row = placed[1]!;
    expect(row.agentRun).toMatchObject({ name: "Child c1", startedAt: 100 });
    // The row takes the child's state and opens the child; the call's JSON is not its report.
    const view = subagentRunView(row, { live: false, children: [child("c1")] });
    expect(view).toMatchObject({ state: "running", child: { sessionId: "c1", projectId: "p" } });
    expect(view.note).toBeUndefined();
    // It joins the turn's agents entry; the unlisted call keeps its tool row.
    const entries = transcriptEntries(placed, "claude", { view: "messages", running: false });
    const agents = entries.find((entry) => entry.kind === "agents");
    expect(agents?.kind === "agents" && agents.blocks.map((block) => block.id)).toEqual(["delegated:c1"]);
    expect(entries.some((entry) => entry.kind !== "message" && entry.kind !== "agents" && entry.blocks.some((block) => block.id === "t3"))).toBe(true);
  });

  it("keeps the transcript untouched without children, readable results or new rows", () => {
    const blocks = [user, start, wait];
    expect(placeDelegatedRuns(blocks, [])).toBe(blocks);
    const unreadable = [user, tool("t", "agents.delegate", "{trunc")];
    expect(placeDelegatedRuns(unreadable, [child("c1")])).toBe(unreadable);
    // A wait that names an unlisted run stays visible.
    const partial = [user, tool("w", "agents.wait", JSON.stringify({ runs: [{ sessionId: "c1" }, { sessionId: "gone" }] }))];
    expect(placeDelegatedRuns(partial, [child("c1")])).toBe(partial);
    // A child that already has a `delegated:` block keeps it, so the call is not doubled.
    const existing = [user, { ...start, id: "delegated:c1" }, start];
    expect(placeDelegatedRuns(existing, [child("c1")])).toBe(existing);
  });

  it("keeps the row's identity until the child changes", () => {
    const first = delegatedRunBlock(start, child("c1"));
    expect(delegatedRunBlock(start, child("c1"))).toBe(first);
    const done = delegatedRunBlock(start, child("c1", { state: "completed", endedAt: 200 }));
    expect(done).not.toBe(first);
    expect(done.tool?.status).toBe("completed");
    expect(done.agentRun?.endedAt).toBe(200);
  });
});
