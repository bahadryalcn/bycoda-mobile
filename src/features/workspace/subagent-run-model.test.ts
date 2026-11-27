import { describe, expect, it } from "vitest";
import type { Block } from "@/domain/types";
import type { ChildSessionEntry } from "./subagent-sessions-model";
import { agentCountText } from "./session-activity-model";
import { sessionModelName } from "./catalog";
import { subagentStopOffered } from "./subagent-model";
import { transcriptEntries } from "./transcript-model";
import { applyToolVisibility } from "./transcript-visibility";
import {
  SETTLED_PILL_MS,
  agentsPillCounts,
  agentsPillExpiresAt,
  agentsPillLabel,
  agentsPillText,
  isOwnerTurnStart,
  latestTurnAgentsIds,
  childOfBlock,
  childRunState,
  childRunTiming,
  childRunView,
  childStatusText,
  countRuns,
  groupElapsedMs,
  latestTurnRunStates,
  previousRouteIs,
  runAvatars,
  runDurationText,
  runHarness,
  runModelName,
  runTone,
  anyLiveRun,
  settleEarlierTurnRuns,
  subagentRunLayout,
  subagentRunView,
  visibleGroupRuns,
} from "./subagent-run-model";

const copy = (_tr: string, en: string, values?: Record<string, string | number>) =>
  en.replace(/\{p(\d)\}/g, (_, index: string) => String(values?.[`p${index}`] ?? ""));
const run = (id: string, extra: Partial<Block> = {}, agentRun: Partial<NonNullable<Block["agentRun"]>> = {}): Block => ({
  id, role: "tool", text: id, ...extra, agentRun: { name: `Agent ${id}`, steps: [], ...agentRun },
});
const child = (sessionId: string, extra: Partial<ChildSessionEntry> = {}): ChildSessionEntry =>
  ({ sessionId, projectId: "p", title: sessionId, kind: "subagent", state: "running", startedAt: 100, meta: "", ...extra });

describe("subagent run rows", () => {
  it("maps each state to its semantic tone", () => {
    expect(runTone("running")).toBe("live");
    expect(runTone("completed")).toBe("success");
    expect(runTone("failed")).toBe("danger");
    expect(runTone("stopped")).toBe("warning");
    expect(runTone("interrupted")).toBe("warning");
    expect(runTone("queued")).toBe("muted");
  });

  it("names the run's own provider from its model, else the parent's", () => {
    expect(runHarness("codex:gpt-5", "claude")).toBe("codex");
    expect(runHarness("claude-sonnet-4-5", "codex")).toBe("claude");
    expect(runHarness("sonnet", "codex")).toBe("claude");
    expect(runHarness("gpt-5.4-mini", "claude")).toBe("codex");
    expect(runHarness("mystery-model", "opencode")).toBe("opencode");
    expect(runHarness(undefined, "claude")).toBe("claude");
    // A model the bundled catalog knows reads by its name; any other drops only its provider prefix.
    expect(runModelName("claude:opus-5", "claude")).toBe(sessionModelName({ harness: "claude", model: "claude:opus-5" }));
    expect(runModelName("claude:opus-5", "claude")).not.toContain(":");
    expect(runModelName("codex:gpt-x", "codex")).toBe("gpt-x");
    expect(runModelName("vendor:custom", "unknown")).toBe("custom");
    expect(runModelName("  ")).toBeUndefined();
  });

  it("shows the latest step while running, the report when done and the first error line when failed", () => {
    const steps = [{ id: "s1", kind: "tool" as const, text: "Read   src/a.ts", status: "running" }];
    const running = subagentRunView(run("a", { tool: { status: "running" } }, { steps, model: "gpt-5", agentType: "explorer" }), { live: true, parentProvider: "claude" });
    expect(running).toMatchObject({ state: "running", tone: "live", harness: "codex", model: "gpt-5", agentType: "explorer", note: { text: "Read src/a.ts", danger: false } });
    const done = subagentRunView(run("b", { tool: { status: "completed", detail: "Found   the bug\nin a.ts" } }, { steps }), { live: true });
    expect(done.note).toEqual({ text: "Found the bug in a.ts", danger: false });
    const failed = subagentRunView(run("c", { tool: { status: "failed", detail: "\nTimeout reached\n  at worker.ts:4" } }), { live: true });
    expect(failed).toMatchObject({ state: "failed", tone: "danger", note: { text: "Timeout reached", danger: true } });
  });

  it("reads an unfinished run as interrupted once the parent stops", () => {
    const view = subagentRunView(run("a", { tool: { status: "running" } }, { startedAt: 1 }), { live: false });
    expect(view.state).toBe("interrupted");
    expect(view.tone).toBe("warning");
  });

  it("links a delegated block to its listed child session, which then owns state and provider", () => {
    const children = [child("kid", { state: "completed", harness: "claude", model: "claude:opus", endedAt: 900 })];
    expect(childOfBlock("delegated:kid", children)?.sessionId).toBe("kid");
    expect(childOfBlock("delegated:other", children)).toBeUndefined();
    expect(childOfBlock("kid", children)).toBeUndefined();
    const view = subagentRunView(run("delegated:kid", { tool: { status: "running" } }), { live: true, children, parentProvider: "codex" });
    expect(view).toMatchObject({ state: "completed", harness: "claude", model: "opus", startedAt: 100, endedAt: 900, child: { sessionId: "kid", projectId: "p" } });
    expect(subagentRunView(run("plain"), { live: true, children }).child).toBeUndefined();
    expect(childRunView(child("solo", { state: "failed", error: "Quota hit\nretry later", harness: "grok" }))).toMatchObject({
      id: "child:solo", tone: "danger", harness: "grok", note: { text: "Quota hit", danger: true }, child: { sessionId: "solo" },
    });
  });

  it("lays one run out as a row and several as a group with up to three marks", () => {
    expect(subagentRunLayout(1)).toBe("row");
    expect(subagentRunLayout(2)).toBe("group");
    const views = ["a", "b", "c", "d", "e"].map((id) => subagentRunView(run(id), { live: true, parentProvider: "claude" }));
    expect(runAvatars(views)).toEqual({ shown: views.slice(0, 3).map((view) => ({ id: view.id, harness: "claude" })), extra: 2 });
    expect(runAvatars(views.slice(0, 2)).extra).toBe(0);
  });

  it("keeps failures visible in a collapsed group", () => {
    const views = [
      subagentRunView(run("ok", { tool: { status: "completed" } }), { live: false }),
      subagentRunView(run("bad", { tool: { status: "failed" } }), { live: false }),
    ];
    expect(visibleGroupRuns(views, true).map((view) => view.id)).toEqual(["ok", "bad"]);
    expect(visibleGroupRuns(views, false).map((view) => view.id)).toEqual(["bad"]);
  });

  it("tallies and times a group", () => {
    const views = [
      subagentRunView(run("a", { tool: { status: "running" } }, { startedAt: 1_000 }), { live: true }),
      subagentRunView(run("b", { tool: { status: "completed" } }, { startedAt: 2_000, endedAt: 5_000 }), { live: true }),
    ];
    expect(agentCountText(countRuns(views.map((view) => view.state)), copy)).toBe("1 running · 1 done");
    expect(groupElapsedMs(views, 10_000)).toBe(9_000);
    const settled = views.map((view) => ({ ...view, state: "completed" as const, endedAt: view.endedAt ?? 7_000 }));
    expect(groupElapsedMs(settled, 99_000)).toBe(6_000);
  });
});

describe("floating agents pill", () => {
  const settled = (counts: Parameters<typeof agentCountText>[0]) => agentCountText(counts, copy);
  const long = (counts: Parameters<typeof agentCountText>[0]) => agentCountText(counts, copy, true);
  it("says how many run while any works, the total in its label, then the settled tally", () => {
    expect(agentsPillText(countRuns(["running", "running", "completed"]), copy, settled)).toBe("2 running");
    expect(agentsPillLabel(countRuns(["running", "running", "completed"]), copy, long)).toBe("2 of 3 subagents running");
    expect(agentsPillText(countRuns(["queued", "completed"]), copy, settled)).toBe("1 queued");
    expect(agentsPillText(countRuns(["completed", "completed", "completed"]), copy, settled)).toBe("3 done");
    expect(agentsPillText(countRuns(["completed", "completed", "failed"]), copy, settled)).toBe("2 done · 1 failed");
    expect(agentsPillLabel(countRuns(["completed", "failed"]), copy, long)).toBe("1 finished, 1 failed");
  });

  const user = (id: string, startedAt: number, extra: Partial<Block> = {}): Block => ({ id, role: "user", text: id, startedAt, ...extra });
  const notice = (id: string, startedAt: number): Block =>
    user(id, startedAt, { text: "Subagent finished", author: { kind: "delegation", runId: "r1", title: "Review", reason: "completion" } });

  it("keeps the turn's children through a delegate's completion notice", () => {
    expect(isOwnerTurnStart(user("u", 1))).toBe(true);
    expect(isOwnerTurnStart(notice("n", 2))).toBe(false);
    expect(isOwnerTurnStart(user("d", 3, { draft: true }))).toBe(false);
    // An assistant or task acting for the owner still starts a turn.
    expect(isOwnerTurnStart(user("t", 4, { author: { kind: "task", id: "t1", name: "Task", reason: "kickoff" } }))).toBe(true);
    const children = [child("a", { startedAt: 20, state: "completed", endedAt: 40 }), child("b", { startedAt: 30, state: "running" })];
    const blocks = [user("u1", 10), notice("n1", 45)];
    // The first child's notice arrives while the second still works; both stay in the pill.
    expect(latestTurnRunStates(blocks, children, true)).toEqual(["completed", "running"]);
    expect(latestTurnRunStates([...blocks, run("inline", { tool: { status: "running" } })], children, true)).toEqual(["running", "completed", "running"]);
    // The next owner message still ends the turn.
    expect(latestTurnRunStates([...blocks, user("u2", 50)], children, true)).toEqual([]);
  });

  it("leaves an idle session's settled pill a while after the last run ended", () => {
    const children = [child("a", { startedAt: 20, state: "completed", endedAt: 1_000 })];
    const blocks = [user("u1", 10)];
    expect(agentsPillCounts(blocks, children, false, 1_000 + SETTLED_PILL_MS)?.done).toBe(1);
    expect(agentsPillCounts(blocks, children, false, 1_001 + SETTLED_PILL_MS)).toBeUndefined();
    // A live parent, or a child still running, keeps it regardless of age.
    expect(agentsPillCounts(blocks, children, true, 10 * SETTLED_PILL_MS)?.done).toBe(1);
    expect(agentsPillCounts(blocks, [...children, child("b", { startedAt: 30 })], false, 10 * SETTLED_PILL_MS)?.running).toBe(1);
    // The turn's recorded duration ends it when the runs carry no end; an unknown end keeps the pill.
    const timed = [user("u1", 10, { durationMs: 990 }), run("x", { tool: { status: "completed" } })];
    expect(agentsPillCounts(timed, [], false, 1_000 + SETTLED_PILL_MS)?.done).toBe(1);
    expect(agentsPillCounts(timed, [], false, 1_001 + SETTLED_PILL_MS)).toBeUndefined();
    expect(agentsPillCounts([user("u1", 10), run("x", { tool: { status: "completed" } })], [], false, 10 * SETTLED_PILL_MS)?.done).toBe(1);
    expect(agentsPillCounts([user("u1", 10)], [], true, 0)).toBeUndefined();
  });

  it("reports when an idle settled pill expires, so a still screen can drop it on time", () => {
    const children = [child("a", { startedAt: 20, state: "completed", endedAt: 1_000 })];
    const blocks = [user("u1", 10)];
    const expires = agentsPillExpiresAt(blocks, children, false);
    expect(expires).toBe(1_000 + SETTLED_PILL_MS);
    expect(agentsPillCounts(blocks, children, false, expires!)?.done).toBe(1);
    expect(agentsPillCounts(blocks, children, false, expires! + 1)).toBeUndefined();
    // Live work, a running child or an unknown end never expire it.
    expect(agentsPillExpiresAt(blocks, children, true)).toBeUndefined();
    expect(agentsPillExpiresAt(blocks, [...children, child("b", { startedAt: 30 })], false)).toBeUndefined();
    expect(agentsPillExpiresAt([user("u1", 10), run("x", { tool: { status: "completed" } })], [], false)).toBeUndefined();
    expect(agentsPillExpiresAt([user("u1", 10)], [], false)).toBeUndefined();
  });

  it("belongs to the latest turn only, so the next user message dismisses it", () => {
    const blocks = [user("u1", 10), run("a", { tool: { status: "completed" } }), run("b", { tool: { status: "running" } })];
    expect(latestTurnRunStates(blocks, [], true)).toEqual(["completed", "running"]);
    expect(latestTurnRunStates([...blocks, user("u2", 50)], [], true)).toEqual([]);
    // Children started in this turn join it once, even when a block stands for them.
    const children = [child("old", { startedAt: 5 }), child("new", { startedAt: 60, state: "completed" }), child("linked", { startedAt: 70 })];
    expect(latestTurnRunStates([...blocks, user("u2", 50), run("delegated:linked", { tool: { status: "running" } })], children, true)).toEqual(["running", "completed"]);
    // Internal records are not the owner's subagents.
    expect(latestTurnRunStates([user("u", 1), run("hidden", { internal: true })], [], true)).toEqual([]);
  });
});

describe("transcript placement", () => {
  const blocks: Block[] = [
    { id: "u", role: "user", text: "go", durationMs: 5_000 },
    { id: "t1", role: "tool", text: "read", tool: { status: "completed" } },
    run("a", { tool: { status: "completed" } }),
    { id: "t2", role: "tool", text: "grep", tool: { status: "completed" } },
    run("b", { tool: { status: "failed" } }),
    { id: "r", role: "assistant", text: "done" },
  ];

  it("keeps a turn's runs together and out of the work fold, failed ones included", () => {
    const entries = transcriptEntries(blocks, "claude", { view: "messages", running: false });
    expect(entries.map((entry) => entry.kind)).toEqual(["message", "activity", "agents", "message"]);
    const work = entries[1] as Extract<(typeof entries)[number], { kind: "activity" }>;
    expect(work.blocks.map((block) => block.id)).toEqual(["t1", "t2"]);
    const agents = entries[2] as Extract<(typeof entries)[number], { kind: "agents" }>;
    expect(agents.blocks.map((block) => block.id)).toEqual(["a", "b"]);
    // A new turn starts a new group.
    const next = transcriptEntries([...blocks, { id: "u2", role: "user", text: "again" }, run("c")], "claude", { view: "messages", running: true });
    expect(next.filter((entry) => entry.kind === "agents")).toHaveLength(2);
  });

  it("lets only the latest owner turn's runs follow the live session", () => {
    const notice: Block = { id: "n", role: "user", text: "done", author: { kind: "delegation", runId: "r", title: "A", reason: "completion" } };
    const history: Block[] = [
      { id: "u1", role: "user", text: "first" }, run("old", { tool: { status: "running" } }),
      { id: "u2", role: "user", text: "second" }, run("now", { tool: { status: "running" } }),
      notice, run("after", { tool: { status: "running" } }),
    ];
    const entries = transcriptEntries(history, "claude", { view: "messages", running: true });
    expect(latestTurnAgentsIds(entries)).toEqual(["agents:now", "agents:after"]);
    // An older turn's unfinished run renders settled: interrupted, without a clock.
    const old = entries.find((entry) => entry.id === "agents:old") as Extract<(typeof entries)[number], { kind: "agents" }>;
    expect(subagentRunView(old.blocks[0]!, { live: latestTurnAgentsIds(entries).includes(old.id) }).state).toBe("interrupted");
    // Without an owner turn in the loaded page every agents row is the latest turn's.
    expect(latestTurnAgentsIds(transcriptEntries([run("solo")], "claude", { view: "messages", running: true }))).toEqual(["agents:solo"]);
  });

  it("settles an older turn's unfinished run in the Agents sheet list while a later turn works", () => {
    const history: Block[] = [
      { id: "u1", role: "user", text: "first" }, run("old", { tool: { status: "running" } }),
      { id: "u2", role: "user", text: "second" }, run("now", { tool: { status: "running" } }),
    ];
    const entries = [{ id: "now", state: "running" as const }, { id: "old", state: "running" as const }];
    expect(settleEarlierTurnRuns(entries, history, true).map((entry) => entry.state)).toEqual(["running", "interrupted"]);
    // Idle sessions were already settled upstream; a page without an owner turn keeps every run live.
    expect(settleEarlierTurnRuns(entries, history, false)).toEqual(entries);
    expect(settleEarlierTurnRuns(entries, [run("old"), run("now")], true)).toEqual(entries);
    // A delegate's completion notice is not an owner turn, so it never cuts the latest turn's runs off.
    const notice: Block = { id: "n", role: "user", text: "done", author: { kind: "delegation", runId: "r", title: "A", reason: "completion" } };
    expect(settleEarlierTurnRuns([{ id: "now", state: "running" as const }], [...history, notice], true)[0]!.state).toBe("running");
  });

  it("keeps the clock for a running child session even when no inline run works", () => {
    expect(anyLiveRun(["completed", "running"])).toBe(true);
    expect(anyLiveRun(["queued"])).toBe(true);
    expect(anyLiveRun(["completed", "interrupted", "failed"])).toBe(false);
  });

  it("never hides runs with the tool-call visibility modes", () => {
    const entries = transcriptEntries(blocks, "claude", { view: "messages", running: false });
    for (const mode of ["hide-successful", "hide-all", "zen"] as const)
      expect(applyToolVisibility(entries, mode, false).some((entry) => entry.kind === "agents" && entry.blocks.length === 2)).toBe(true);
  });
});

describe("child session status", () => {
  const session = (status: "idle" | "running" | "interrupted", blocks: Block[] = [], updatedAt = 600_000) =>
    ({ status, updatedAt, session: { blocks } });
  it("reads the child's state from its run, then the link's outcome", () => {
    expect(childRunState({ status: "running" }, { status: "failed" })).toBe("running");
    expect(childRunState({ status: "interrupted" }, {})).toBe("interrupted");
    expect(childRunState({ status: "idle" }, { status: "failed" })).toBe("failed");
    expect(childRunState({ status: "idle" }, { status: "cancelled" })).toBe("stopped");
    expect(childRunState({ status: "idle" }, { status: "succeeded" })).toBe("completed");
  });

  it("times the latest round: Host duration, else finishedAt, else the approximate updatedAt", () => {
    const turn: Block = { id: "u", role: "user", text: "go", startedAt: 100_000, durationMs: 482_000 };
    expect(childRunTiming(session("running", [turn]), { startedAt: 1 })).toEqual({ startedAt: 100_000 });
    expect(childRunTiming(session("idle", [turn]), { startedAt: 1 })).toEqual({ startedAt: 100_000, durationMs: 482_000 });
    expect(childRunTiming(session("idle"), { startedAt: 100_000, finishedAt: 160_000 })).toEqual({ startedAt: 100_000, durationMs: 60_000 });
    expect(childRunTiming(session("idle"), { startedAt: 100_000 })).toEqual({ startedAt: 100_000, durationMs: 500_000 });
  });

  it("says Working with the clock, Finished in the span, or the state word", () => {
    expect(childStatusText("running", { startedAt: 0 }, 133_000, copy)).toBe("Working 2:13");
    expect(childStatusText("completed", { durationMs: 482_000 }, 0, copy)).toBe("Finished in 8 min 2 s");
    expect(childStatusText("completed", {}, 0, copy)).toBe("Done");
    expect(childStatusText("failed", { durationMs: 1 }, 0, copy)).toBe("Failed");
    expect(runDurationText(45_400, copy)).toBe("45 s");
    expect(runDurationText(3_900_000, copy)).toBe("1 h 5 min");
  });

  it("goes Back only when the page underneath is the parent session", () => {
    const state = (routes: { name: string; params?: object }[]) => ({ index: routes.length - 1, routes });
    expect(previousRouteIs(state([{ name: "session/[id]", params: { id: "parent" } }, { name: "session/[id]", params: { id: "child" } }]), "parent")).toBe(true);
    expect(previousRouteIs(state([{ name: "sessions" }, { name: "session/[id]", params: { id: "child" } }]), "parent")).toBe(false);
    expect(previousRouteIs(state([{ name: "session/[id]", params: { id: "child" } }]), "parent")).toBe(false);
    expect(previousRouteIs(undefined, "parent")).toBe(false);
  });
});

describe("inline stop", () => {
  const block = run("a", { tool: { status: "running", callId: "call" } }, { startedAt: 1 });
  const ok = { block, runId: "run", parentProvider: "claude", capabilities: ["sessions.stopItem.claude"] };
  it("is offered only where the details' stop can run", () => {
    expect(subagentStopOffered(ok)).toBe(true);
    expect(subagentStopOffered({ ...ok, capabilities: [] })).toBe(false);
    expect(subagentStopOffered({ ...ok, parentProvider: "codex" })).toBe(false);
    expect(subagentStopOffered({ ...ok, runId: "desktop" })).toBe(false);
    expect(subagentStopOffered({ ...ok, disabled: true })).toBe(false);
    expect(subagentStopOffered({ ...ok, interrupted: true })).toBe(false);
    expect(subagentStopOffered({ ...ok, block: { ...block, tool: { status: "completed", callId: "call" } } })).toBe(false);
    expect(subagentStopOffered({ ...ok, block: { ...block, agentRun: { ...block.agentRun!, workflow: { callId: "w" } } } })).toBe(false);
  });
});
