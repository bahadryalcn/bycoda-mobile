import type { HostTerminal, HostTerminalRead } from "../../../../src/features/host-tools/terminalTypes";

export const TERMINAL_OUTPUT_LIMIT = 65_536;
export type TerminalOutput = { output: string; cursor: number; truncated: boolean; hasMore: boolean; terminal?: HostTerminal };

export const emptyTerminalOutput = (): TerminalOutput => ({ output: "", cursor: 0, truncated: false, hasMore: false });

export const TERMINAL_POLL_MS = 1500;
export const TERMINAL_POLL_MAX_MS = 30_000;

/** Unchanged reads polled at the base rate before a quiet terminal is read less often. */
const TERMINAL_QUIET_READS = 3;
const TERMINAL_QUIET_STEPS = [3000, 6000, 10_000] as const;

/**
 * Background poll delay: more pages continue quickly; failures back off exponentially up to the
 * cap; a quiet buffer (consecutive unchanged reads) steps from 1.5 s through 3 s and 6 s to 10 s.
 */
export function terminalPollDelay(failures: number, hasMore: boolean, unchanged = 0): number {
  if (hasMore) return 100;
  if (failures <= 0) {
    if (unchanged <= TERMINAL_QUIET_READS) return TERMINAL_POLL_MS;
    return TERMINAL_QUIET_STEPS[Math.min(unchanged - TERMINAL_QUIET_READS, TERMINAL_QUIET_STEPS.length) - 1]!;
  }
  return Math.min(TERMINAL_POLL_MS * 2 ** Math.min(failures, 5), TERMINAL_POLL_MAX_MS);
}

/** True when a read changed nothing a reader can see, so the buffer need not be rebuilt or re-rendered. */
export function sameTerminalOutput(a: TerminalOutput, b: TerminalOutput): boolean {
  return a.cursor === b.cursor && a.output === b.output && a.truncated === b.truncated && a.hasMore === b.hasMore &&
    JSON.stringify(a.terminal) === JSON.stringify(b.terminal);
}

export function projectTerminals(terminals: readonly HostTerminal[], projectId: string): HostTerminal[] {
  return terminals.filter((terminal) => terminal.projectId === projectId && typeof terminal.id === "string" && terminal.id.length > 0);
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

type StateCopy = (tr: string, en: string, values?: Record<string, string | number>) => string;

/** One name per terminal state in every terminal view: running, or closed. */
export function terminalStateLabel(running: boolean, copy: StateCopy): string {
  return running ? copy("Çalışıyor", "Running") : copy("Kapandı", "Closed");
}

/** The status line of a terminal whose shell ended, with its exit code when known. */
export function terminalClosedLabel(exitCode: number | null | undefined, copy: StateCopy): string {
  return exitCode === null || exitCode === undefined
    ? copy("Kapandı.", "Closed.")
    : copy("Kapandı. Çıkış kodu: {p0}", "Closed. Exit code: {p0}", { p0: exitCode });
}

/** The shell as its program name; a full path stays out of the row. */
export function terminalShellName(shell: string | undefined): string {
  return shell?.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
}
