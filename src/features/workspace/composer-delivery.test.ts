import { describe, expect, it } from "vitest";
import {
  composerCommand,
  moveQueuedMessage,
  queuedCommand,
  queuedComposerMessage,
} from "./composer-delivery";
import type { HostSession } from "./wire";
import type { SharedQueue } from "../../../../src/features/connections/model/sharedQueue";

const session = (status: HostSession["status"] = "idle"): HostSession => ({
  session: {
    id: "s",
    harness: "codex",
    model: "codex:test",
    modelSettings: { effort: "medium" },
    runtimeMode: "supervised",
    title: "Chat",
    cwd: "/project",
    blocks: [],
  },
  projectId: "p",
  revision: 4,
  status,
  updatedAt: 1,
  ...(status === "running" ? { runId: "exact-active-run" } : {}),
});
const attachment = {
  id: "file",
  name: "report.pdf",
  mimeType: "application/pdf",
  size: 123,
  kind: "file" as const,
};
const queue = (): SharedQueue => ({
  revision: 7,
  status: "active",
  consumer: "mobile:test",
  messages: [queuedComposerMessage("q", session(), "Next", [attachment])],
});

describe("mobile composer delivery", () => {
  it("sends an idle turn with attachments and never turns a running send into a draft", () => {
    expect(composerCommand(session(), "send", "Hello", [attachment])).toEqual({
      type: "send",
      sessionId: "s",
      text: "Hello",
      attachments: [attachment],
    });
    expect(() => composerCommand(session("running"), "send", "Hello", [])).toThrow(/queue/);
  });
  it("steers only the exact running turn and preserves file references", () => {
    expect(composerCommand(session("running"), "steer", "Change direction", [attachment])).toEqual({
      type: "steer",
      sessionId: "s",
      runId: "exact-active-run",
      text: "Change direction",
      attachments: [attachment],
    });
    expect(() => composerCommand(session(), "steer", "Late", [])).toThrow(/running turn/);
    expect(() =>
      composerCommand({ ...session("running"), runId: undefined }, "steer", "Late", []),
    ).toThrow();
  });
  it("retains the queued model, settings, plan intent and attachments", () => {
    const value = session();
    const row = queuedComposerMessage("q", value, "/plan Add a search", [attachment]);
    expect(row).toMatchObject({
      id: "q",
      text: "Add a search",
      intent: "plan",
      attachments: [attachment],
      modelTarget: { harness: "codex", model: "codex:test", modelSettings: { effort: "medium" } },
    });
    value.session.modelSettings!.effort = "high";
    expect(row.modelTarget?.modelSettings.effort).toBe("medium");
  });
  it("consumes queue rows with the host's atomic id, consumer and revision", () => {
    expect(queuedCommand(queue(), session(), "mobile:test")).toMatchObject({
      type: "send",
      text: "Next",
      attachments: [attachment],
      queued: { id: "q", clientId: "mobile:test", revision: 7 },
    });
    for (const changed of [
      { ...queue(), status: "paused" as const },
      { ...queue(), consumer: "desktop:other" },
      { ...queue(), editingId: "q" },
      { ...queue(), claim: { id: "q", clientId: "desktop:other", token: "claim" } },
    ])
      expect(() => queuedCommand(changed, session(), "mobile:test")).toThrow();
  });
  it("holds queue rows for a different model or reasoning setting", () => {
    const value = session();
    value.session.modelSettings = { effort: "high" };
    expect(() => queuedCommand(queue(), value, "mobile:test")).toThrow(/model settings/);
    value.session.model = "codex:other";
    expect(() => queuedCommand(queue(), value, "mobile:test")).toThrow(/model settings/);
  });
  it("preserves explicit queued plan intent without reinterpreting prose", () => {
    const value = queue();
    value.messages = [queuedComposerMessage("plan", session(), "/plan Ship it", [])];
    expect(queuedCommand(value, session(), "mobile:test")).toMatchObject({
      type: "send",
      text: "Ship it",
      intent: "plan",
    });
    value.messages[0]!.text = "/plan is part of my message";
    value.messages[0]!.intent = undefined;
    expect(queuedCommand(value, session(), "mobile:test")).toMatchObject({
      type: "send",
      text: "/plan is part of my message",
    });
    expect(queuedCommand(value, session(), "mobile:test")).not.toHaveProperty("intent");
  });
  it("holds rows with missing files and unsupported desktop content instead of dropping it", () => {
    const value = queue();
    value.messages[0]!.attachments[0]!.missing = true;
    expect(() => queuedCommand(value, session(), "mobile:test")).toThrow(/missing files/);
    value.messages[0]!.attachments[0]!.missing = false;
    value.messages[0]!.intent = "orchestrate";
    expect(() => queuedCommand(value, session(), "mobile:test")).toThrow(/special content/);
    value.messages[0]!.intent = "build";
    expect(queuedCommand(value, session(), "mobile:test")).toMatchObject({ intent: "build" });
  });
  it("queues compact as a compact action and rejects compact with files", () => {
    const value = queue();
    value.messages = [queuedComposerMessage("compact", session(), "/compact", [])];
    expect(queuedCommand(value, session(), "mobile:test")).toMatchObject({
      type: "compact",
      queued: { id: "compact" },
    });
    expect(() => composerCommand(session(), "send", "/compact", [attachment])).toThrow(
      /attachments/,
    );
  });
  it("reorders without mutating the host snapshot or changing message contents", () => {
    const value = queue();
    value.messages.push(queuedComposerMessage("second", session(), "Later", []));
    expect(moveQueuedMessage(value, "second", -1).messages.map((row) => row.id)).toEqual([
      "second",
      "q",
    ]);
    expect(value.messages.map((row) => row.id)).toEqual(["q", "second"]);
    expect(moveQueuedMessage(value, "q", -1)).toBe(value);
  });
});
