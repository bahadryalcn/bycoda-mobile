import { describe, expect, it } from "vitest";
import {
  outboxBubble,
  TranscriptPresentation,
  transcriptEntries,
  turnStartedAt,
} from "./transcript-model";
import { deriveSessionActivity } from "./session-activity-model";
import type { Block } from "./wire";

const block = (id: string, role: Block["role"], fields: Partial<Block> = {}): Block => ({ id, role, text: id, ...fields });
const stop = block("stop", "system", { notice: "interrupt", text: "Stopped by you." });

describe("a steer stays inside the turn it steered", () => {
  // The Host stamps start, duration and Stop on the turn's owner; the delivered steer has none.
  const owner = block("u1", "user", { startedAt: 1_000, durationMs: 46_000, turnOutcome: "stopped" });
  const steer = block("s1", "user", { continuationOf: "u1" });
  const work = (id: string) => block(id, "tool", { tool: { status: "completed" } });

  it("keeps the live clock on the owner's start after a steer is delivered", () => {
    expect(turnStartedAt([owner, work("t1"), steer])).toBe(1_000);
    expect(turnStartedAt([owner, steer, block("s2", "user", { continuationOf: "s1" })])).toBe(1_000);
    // A pending steer is still a draft and never moves the clock either.
    expect(turnStartedAt([owner, block("p", "user", { draft: true, followUpDelivery: "pending", continuationOf: "u1" })])).toBe(1_000);
    // The owner is outside the loaded page: no clock rather than an older turn's start.
    expect(turnStartedAt([block("old", "user", { startedAt: 5 }), block("a", "assistant"), steer])).toBeUndefined();
    expect(turnStartedAt([block("u2", "user", { startedAt: 2_000 })])).toBe(2_000);
    expect(turnStartedAt([])).toBeUndefined();
    expect(deriveSessionActivity({ blocks: [owner, work("t1"), steer], live: true }).startedAt).toBe(1_000);
  });

  it("shows one stopped receipt at the turn's end, with no separate Stop row", () => {
    const blocks = [owner, work("t1"), block("a1", "assistant"), steer, work("t2"), block("a2", "assistant"), stop];
    const entries = transcriptEntries(blocks, "codex", { view: "messages", running: false });
    expect(entries.map((entry) => entry.id)).not.toContain("stop");
    const footers = entries.filter((entry) => entry.footer);
    expect(footers.map((entry) => entry.id)).toEqual(["a2"]);
    expect(footers[0]?.footer?.id).toBe("u1");
    // The turn's first work row carries the duration; the work after the steer is its own row.
    const work1 = entries.find((entry) => entry.id === "work:t1");
    const work2 = entries.find((entry) => entry.id === "work:t2");
    expect(work1?.kind === "activity" && work1.foldTurn?.id).toBe("u1");
    expect(work2?.kind === "activity" && work2.foldTurn).toBeUndefined();
    expect(entries.findIndex((entry) => entry.id === "s1")).toBeLessThan(entries.findIndex((entry) => entry.id === "work:t2"));
  });

  it("regroups incrementally to the same entries when the turn settles after a steer", () => {
    const presentation = new TranscriptPresentation();
    const running = [{ ...owner, durationMs: undefined, turnOutcome: undefined }, work("t1"), steer, block("a2", "assistant")];
    presentation.update(running, "codex", { view: "messages", running: true });
    const settled = [owner, ...running.slice(1), stop];
    const incremental = presentation.update(settled, "codex", { view: "messages", running: false });
    const full = transcriptEntries(settled, "codex", { view: "messages", running: false });
    expect(incremental.map((entry) => [entry.id, entry.footer?.id])).toEqual(full.map((entry) => [entry.id, entry.footer?.id]));
    expect(incremental.map((entry) => entry.id)).not.toContain("stop");
  });
});

describe("outbox bubble", () => {
  const base = { now: 5_000, sweepMs: 10_000 };
  const row = (fields: Partial<{ status: string; mode: string; createdAt: number; blockedReason: string }> = {}) => ({ status: "blocked", mode: "send", createdAt: 1_000, ...fields });

  it("reads the composer's write-ahead row as a message on its way, not a paused delivery", () => {
    expect(outboxBubble(row(), { ...base, notice: "blocked", locked: true, newest: true })).toEqual({
      hidden: false, pending: true, retry: false, actions: false,
    });
    // Long uploads outlast the sweep but still say nothing while the send runs.
    expect(outboxBubble(row(), { ...base, now: 60_000, notice: "blocked", locked: true, newest: true }).caption).toBeUndefined();
    // A queued send belongs to the queue, never to the conversation.
    expect(outboxBubble(row({ mode: "queue" }), { ...base, notice: "blocked", locked: true, newest: true }).hidden).toBe(true);
  });

  it("says why a row really stopped once no send holds it", () => {
    expect(outboxBubble(row(), { ...base, notice: "blocked", locked: false, newest: true })).toEqual({
      hidden: false, pending: false, caption: "blocked", retry: true, actions: true,
    });
    // An older blocked row under another send's lock, or an expired one, keeps its reason.
    expect(outboxBubble(row(), { ...base, notice: "blocked", locked: true, newest: false }).caption).toBe("blocked");
    expect(outboxBubble(row({ blockedReason: "expired" }), { ...base, notice: "expired", locked: true, newest: true }).caption).toBe("expired");
    expect(outboxBubble(row({ status: "dropped" }), { ...base, notice: "unavailable", locked: false, newest: true })).toMatchObject({ caption: "unavailable", retry: false });
  });

  it("lets a waiting row sweep, then say it waits with Retry; a delivered bridge stays quiet", () => {
    expect(outboxBubble(row({ status: "waiting" }), { ...base, notice: "waiting", locked: false, newest: true })).toEqual({
      hidden: false, pending: true, retry: false, actions: true,
    });
    expect(outboxBubble(row({ status: "waiting" }), { ...base, now: 11_000, notice: "waiting", locked: false, newest: true })).toMatchObject({
      caption: "waiting", retry: true,
    });
    expect(outboxBubble(row({ status: "delivered" }), { ...base, now: 60_000, notice: "waiting", locked: false, newest: true })).toEqual({
      hidden: false, pending: true, retry: false, actions: false,
    });
  });
});

describe("tool visibility around a steer", () => {
  it("keeps the steered turn whole: one duration, and Zen keeps the turn's final answer", async () => {
    const { applyToolVisibility } = await import("./transcript-visibility");
    const owner = block("u1", "user", { startedAt: 1, durationMs: 46_000 });
    const blocks = [
      owner,
      block("t1", "tool", { tool: { status: "completed" } }),
      block("a1", "assistant"),
      block("s1", "user", { continuationOf: "u1" }),
      block("a2", "assistant"),
    ];
    const entries = transcriptEntries(blocks, "codex", { view: "messages", running: false });
    const hidden = applyToolVisibility(entries, "hide-successful", false);
    // The fold row is gone, so the receipt carries the duration, once.
    expect(hidden.find((entry) => entry.footer)?.footerDuration).toBe(true);
    const shown = applyToolVisibility(transcriptEntries(blocks, "codex", { view: "messages", running: false }), "zen", false);
    expect(shown.map((entry) => entry.id)).toEqual(["u1", "s1", "a2"]);
  });
});

describe("one live indicator", () => {
  it("never shows Thinking beside the live row's Working clock", async () => {
    const { readFileSync } = await import("node:fs");
    const notices = readFileSync(new URL("./turn-status-notices.tsx", import.meta.url), "utf8");
    const live = notices.slice(notices.indexOf("export function LiveTurnRow"), notices.indexOf("export function ProviderRetryNotice"));
    expect(live).not.toMatch(/Düşünüyor|Thinking/);
    expect(readFileSync(new URL("./session-transcript.tsx", import.meta.url), "utf8")).not.toContain("awaitingFirstOutput");
  });
});

describe("draft actions after a run", () => {
  it("offers Retry and Send draft from the session's running state, not the run id the Host keeps", async () => {
    const { readFileSync } = await import("node:fs");
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source("./transcript-block.tsx")).toMatch(/const canSendDraft = !disabled && !running;/);
    expect(source("./transcript-row.tsx")).toMatch(/running=\{live\}/);
    // Draft rows, and only they among message rows, receive the running flag.
    expect(source("./session-transcript.tsx")).toMatch(/\(item\.kind !== "message" \|\| !!item\.block\.draft\) && live/);
  });
});

describe("command failures are shown once", () => {
  it("keeps only the lost-reply check at the transcript's end; the sending control shows other failures", async () => {
    const { readFileSync } = await import("node:fs");
    const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
    const transcript = source("./session-transcript.tsx");
    expect(transcript).toMatch(/error=\{command\.error instanceof UncertainCommand \? command\.error : null\}/);
    // Continue and Edit from here have no line of their own, so they toast instead of failing silently.
    expect(transcript).toMatch(/CONTINUE_PROMPT, \[\]\)\)\.catch\(reportActionFailure\)/);
    expect(transcript).toMatch(/appendToDraft\(scope, \{ text: review\.prompt \}\)\)\s*\.catch\(reportActionFailure\)/);
    expect(source("./transcript-block.tsx")).toMatch(/draftBlockId: value\.id \}\)\.catch\(draftFailed\)/);
  });
});
