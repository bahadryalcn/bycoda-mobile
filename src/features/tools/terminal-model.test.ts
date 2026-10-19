import { describe, expect, it } from "vitest";
import type { HostTerminal, HostTerminalRead } from "../../../../src/features/host-tools/terminalTypes";
import { appendTerminalOutput, emptyTerminalOutput, projectTerminals, terminalCommandInput, terminalDisplayOutput, TERMINAL_OUTPUT_LIMIT } from "./terminal-model";

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
  it("preserves explicit command bytes and refuses blank or terminal-control input", () => {
    expect(terminalCommandInput("echo hello")).toBe("echo hello\n");
    expect(terminalCommandInput("echo first\necho second\n")).toBe("echo first\necho second\n");
    for (const input of ["  ", "\u0003", "\u0000", "\u001b[A", "a".repeat(16_385)]) expect(terminalCommandInput(input)).toBeUndefined();
    expect(terminalCommandInput("a".repeat(16_383))).toHaveLength(16_384);
    expect(terminalCommandInput("a".repeat(16_384))).toBeUndefined();
    expect(terminalCommandInput("😀".repeat(4095))).toBeDefined();
    expect(terminalCommandInput("😀".repeat(4096))).toBeUndefined();
  });
  it("renders shell output as plain text without ANSI or OSC controls", () => {
    expect(terminalDisplayOutput("\u001b[31mred\u001b[0m\r\n\u001b]0;title\u0007ok\u0000")).toBe("red\nok");
  });
});
