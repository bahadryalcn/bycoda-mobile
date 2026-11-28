import { describe, expect, it } from "vitest";
import { activeComposerMode, shellModeActive, stripShellMode } from "./composer-mode";
import { shellComposerCommand } from "./composer-delivery";
import { shellFollowUpDecision } from "./shell-follow-up";
import type { Block, HostSession } from "./wire";

const session = (overrides: Partial<HostSession> = {}, blocks: Block[] = []): HostSession => ({
  session: {
    id: "s",
    harness: "codex",
    model: "codex:test",
    modelSettings: {},
    runtimeMode: "supervised",
    title: "Chat",
    cwd: "/project",
    blocks,
  },
  projectId: "p",
  revision: 4,
  status: "idle",
  updatedAt: 1,
  authorityGeneration: 3,
  ...overrides,
});
const extras = { supported: true, attachments: 0, noteCard: false };
const shell = (running: boolean, exitCode: number | null = 0): Block => ({
  id: "cmd-1",
  role: "system",
  text: "",
  shell: { command: "ls", output: running ? "" : "a.txt", exitCode: running ? null : exitCode, ...(running ? { running: true } : {}) },
});

describe("shell mode parsing", () => {
  it("treats a leading ! as Shell mode but not a Markdown image", () => {
    expect(shellModeActive("!ls -la")).toBe(true);
    expect(shellModeActive("  !git status")).toBe(true);
    expect(shellModeActive("!")).toBe(true);
    expect(shellModeActive("![logo](x.png)")).toBe(false);
    expect(shellModeActive("run !ls")).toBe(false);
    expect(activeComposerMode("!ls")).toBe(null);
  });

  it("turns Shell mode off by removing only the leading !", () => {
    expect(stripShellMode("!ls -la")).toBe("ls -la");
    expect(stripShellMode("  ! git status")).toBe("git status");
    expect(stripShellMode("say !hi")).toBe("say !hi");
  });
});

describe("shell delivery", () => {
  it("sends the Host shell command with the displayed authority, also while a turn runs", () => {
    expect(shellComposerCommand(session(), "!ls -la ", extras)).toEqual({
      type: "shell",
      authorityGeneration: 3,
      sessionId: "s",
      line: "ls -la",
    });
    expect(shellComposerCommand(session({ status: "running", runId: "r" }), "!pwd", extras)).toMatchObject({
      type: "shell",
      line: "pwd",
    });
  });

  it("refuses instead of sending the line as a prompt", () => {
    expect(() => shellComposerCommand(session(), "!ls", { ...extras, supported: false })).toThrow(/Update bycoda/);
    expect(() => shellComposerCommand(session(), "!ls", { ...extras, attachments: 1 })).toThrow(/Remove the files/);
    expect(() => shellComposerCommand(session(), "!ls", { ...extras, noteCard: true })).toThrow(/Remove the files/);
    expect(() => shellComposerCommand(session(), "!  ", extras)).toThrow(/Type a command/);
    expect(() => shellComposerCommand(session(), `!${"x".repeat(10_001)}`, extras)).toThrow(/Type a command/);
  });
});

describe("shell follow-up", () => {
  const run = { commandId: "cmd-1", authorityGeneration: 3 };
  it("waits for the run's block to finish", () => {
    expect(shellFollowUpDecision(undefined, run)).toBe("wait");
    expect(shellFollowUpDecision(session(), run)).toBe("wait");
    expect(shellFollowUpDecision(session({}, [shell(true)]), run)).toBe("wait");
  });

  it("carries on when the session is idle under the same authority, failed commands included", () => {
    expect(shellFollowUpDecision(session({}, [shell(false)]), run)).toBe("send");
    expect(shellFollowUpDecision(session({}, [shell(false, 1)]), run)).toBe("send");
  });

  it("drops the follow-up for a busy session or changed authority", () => {
    expect(shellFollowUpDecision(session({ status: "running", runId: "r" }, [shell(false)]), run)).toBe("drop");
    expect(shellFollowUpDecision(session({ authorityGeneration: 4 }, [shell(false)]), run)).toBe("drop");
    expect(shellFollowUpDecision(session({ executionOwner: "desktop" } as Partial<HostSession>, [shell(false)]), run)).toBe("drop");
  });
});
