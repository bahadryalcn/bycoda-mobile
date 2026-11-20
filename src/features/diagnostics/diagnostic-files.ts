/** Synchronous file access so a crash marker can be written while the app is dying. */
export interface DiagnosticFiles {
  read(name: string): string | null;
  write(name: string, text: string): void;
  /** Adds text to the end of the file (creating it) without rewriting what is already there. */
  append(name: string, text: string): void;
  remove(name: string): void;
}

export const CURRENT_LOG = "current.log";
export const PREVIOUS_LOG = "previous.log";
export const CRASH_MARKER = "crash.json";
