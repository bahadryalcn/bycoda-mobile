import type { HostTerminal, HostTerminalRead } from "../../../../src/features/host-tools/terminalTypes";
import { utf8Bytes } from "@/remote/transport-validation";

export const TERMINAL_OUTPUT_LIMIT = 65_536;
export const TERMINAL_COMMAND_LIMIT = 16_384;
export type TerminalOutput = { output: string; cursor: number; truncated: boolean; hasMore: boolean; terminal?: HostTerminal };

export const emptyTerminalOutput = (): TerminalOutput => ({ output: "", cursor: 0, truncated: false, hasMore: false });

export function projectTerminals(terminals: readonly HostTerminal[], projectId: string): HostTerminal[] {
  return terminals.filter((terminal) => terminal.projectId === projectId && typeof terminal.id === "string" && terminal.id.length > 0);
}

/** A newline is sent only by the explicit Send command action, never by keyboard submission. */
export function terminalCommandInput(command: string): string | undefined {
  if (!command.trim() || command.length > TERMINAL_COMMAND_LIMIT || /[\u0000\u0003\u001b]/.test(command)) return undefined;
  const input = command.endsWith("\n") ? command : `${command}\n`;
  return utf8Bytes(input) <= TERMINAL_COMMAND_LIMIT ? input : undefined;
}

export function appendTerminalOutput(previous: TerminalOutput, snapshot: HostTerminalRead, projectId: string, id: string): TerminalOutput {
  if (snapshot.terminal?.id !== id || snapshot.terminal.projectId !== projectId ||
      typeof snapshot.output !== "string" || !Number.isSafeInteger(snapshot.cursor) || snapshot.cursor < previous.cursor || snapshot.cursor < snapshot.output.length)
    throw new Error("Invalid terminal response.");
  // Polling or reconnection can return an already consumed cursor. Never duplicate its text.
  const next = snapshot.cursor === previous.cursor ? previous.output : previous.output + snapshot.output;
  return {
    output: next.slice(-TERMINAL_OUTPUT_LIMIT), cursor: snapshot.cursor,
    truncated: previous.truncated || snapshot.truncated || next.length > TERMINAL_OUTPUT_LIMIT,
    hasMore: snapshot.hasMore,
    terminal: snapshot.terminal,
  };
}

/** CodeText is a plain-text reader, not an ANSI emulator; hide shell control sequences. */
export function terminalDisplayOutput(output: string): string {
  return output.replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}
