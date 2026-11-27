import { describe, expect, it } from "vitest";
import type { HostTerminal, HostTerminalRead } from "../../../../src/features/host-tools/terminalTypes";
import { appendTerminalOutput, emptyTerminalOutput, projectTerminals, sameTerminalOutput, terminalDisplayOutput, terminalPollDelay, TERMINAL_OUTPUT_LIMIT } from "./terminal-model";

const terminal: HostTerminal = {
  id: "shell", projectId: "project", name: "Shell", cwd: "/project", shell: "sh",
  state: "running", createdAt: 1, exitCode: null, transport: "pipe",
};
const read = (fields: Partial<HostTerminalRead> = {}): HostTerminalRead => ({
  terminal, output: "hello", cursor: 5, truncated: false, hasMore: false, ...fields,
});

describe("mobile terminal safety and bounded output", () => {
  it("isolates project terminals and rejects mismatched output identities", () => {
    expect(projectTerminals([terminal, { ...terminal, id: "other", projectId: "other" }], "project")).toEqual([terminal]);
    expect(() => appendTerminalOutput(emptyTerminalOutput(), read(), "other", "shell")).toThrow();
    expect(() => appendTerminalOutput(emptyTerminalOutput(), read(), "project", "other")).toThrow();
  });
  it("appends each cursor once and reports retained-output truncation", () => {
    const first = appendTerminalOutput(emptyTerminalOutput(), read(), "project", "shell");
    expect(appendTerminalOutput(first, read(), "project", "shell").output).toBe("hello");
    const snapshot = read({ output: "x".repeat(TERMINAL_OUTPUT_LIMIT), cursor: TERMINAL_OUTPUT_LIMIT + 5 });
    const next = appendTerminalOutput(first, snapshot, "project", "shell");
    expect(next.output).toHaveLength(TERMINAL_OUTPUT_LIMIT);
    expect(next.truncated).toBe(true);
    expect(() => appendTerminalOutput(next, read(), "project", "shell")).toThrow();
    expect(() => appendTerminalOutput(emptyTerminalOutput(), read({ cursor: 1 }), "project", "shell")).toThrow();
    expect(appendTerminalOutput(emptyTerminalOutput(), read({ hasMore: true }), "project", "shell").hasMore).toBe(true);
    expect(appendTerminalOutput(emptyTerminalOutput(), read({ truncated: true }), "project", "shell").truncated).toBe(true);
  });
  it("renders shell output as plain text without ANSI or OSC controls", () => {
    expect(terminalDisplayOutput("\u001b[31mred\u001b[0m\r\n\u001b]0;title\u0007ok\u0000")).toBe("red\nok");
  });
  it("backs off background polls after failures and keeps pagination quick", () => {
    expect(terminalPollDelay(0, false)).toBe(1500);
    expect(terminalPollDelay(1, false)).toBe(3000);
    expect(terminalPollDelay(2, false)).toBe(6000);
    expect(terminalPollDelay(50, false)).toBe(30_000);
    expect(terminalPollDelay(3, true)).toBe(100);
  });
  it("reads a quiet buffer less often after a few unchanged polls", () => {
    expect(terminalPollDelay(0, false, 3)).toBe(1500);
    expect(terminalPollDelay(0, false, 4)).toBe(3000);
    expect(terminalPollDelay(0, false, 5)).toBe(6000);
    expect(terminalPollDelay(0, false, 6)).toBe(10_000);
    expect(terminalPollDelay(0, false, 60)).toBe(10_000);
    expect(terminalPollDelay(0, true, 60)).toBe(100);
    expect(terminalPollDelay(1, false, 60)).toBe(3000);
  });
  it("detects reads that leave the visible buffer unchanged", () => {
    const first = appendTerminalOutput(emptyTerminalOutput(), read(), "project", "shell");
    expect(sameTerminalOutput(first, appendTerminalOutput(first, read({ output: "", cursor: 5 }), "project", "shell"))).toBe(true);
    expect(sameTerminalOutput(first, appendTerminalOutput(first, read({ output: " more", cursor: 10 }), "project", "shell"))).toBe(false);
    expect(sameTerminalOutput(first, appendTerminalOutput(first, read({ output: "", cursor: 5, hasMore: true }), "project", "shell"))).toBe(false);
  });
});

it("names terminal states and shells the same way in every terminal view", async () => {
  const { terminalClosedLabel, terminalShellName, terminalStateLabel } = await import("./terminal-model");
  const copy = (_tr: string, en: string, values?: Record<string, string | number>) => en.replace("{p0}", String(values?.p0 ?? ""));
  expect(terminalStateLabel(false, copy)).toBe("Closed");
  expect(terminalClosedLabel(2, copy)).toBe("Closed. Exit code: 2");
  expect(terminalClosedLabel(null, copy)).toBe("Closed.");
  expect(terminalShellName("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")).toBe("powershell.exe");
  expect(terminalShellName("/bin/zsh")).toBe("zsh");
});
