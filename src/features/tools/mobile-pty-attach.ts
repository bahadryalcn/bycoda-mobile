import { appendToDraft, fencedBlock } from "../workspace/draft-append";
import type { SessionScope } from "../workspace/session-types";

/** The last lines handed to the draft; enough for an error and its context, small enough to send. */
export const ATTACH_OUTPUT_LINES = 60;
const MAX_CHARS = 16_000;

/** Adds the terminal's recent output to the session's composer draft as a fenced block. */
export function attachTerminalOutput(scope: Pick<SessionScope, "machineId" | "sessionId">, recent: (count: number) => string) {
  let output = recent(ATTACH_OUTPUT_LINES);
  if (!output.trim()) throw new Error("There is no terminal output to attach yet.");
  if (output.length > MAX_CHARS) output = output.slice(-MAX_CHARS);
  appendToDraft(scope, { text: fencedBlock(output, "text") });
}
