import { useCallback, useEffect, useRef } from "react";
import { SHELL_FOLLOW_UP_PROMPT } from "../../../../src/features/sessions/model/shellRun";
import { composerCommand, desktopOwnsTurn } from "./composer-delivery";
import type { SessionCommand } from "./session-types";
import type { HostSession } from "./wire";

/** A `!command` this composer sent; the Host names its transcript block after the command id. */
export type PendingShellRun = { commandId: string; authorityGeneration?: number };

export type ShellFollowUpDecision = "wait" | "send" | "drop";

/**
 * Desktop hands a finished `!command` to the agent with a fixed follow-up prompt. The phone does
 * the same when the session is idle under the authority the command was sent with. A busy session
 * or changed authority drops the follow-up: the Host still adds the output to the next message.
 */
export function shellFollowUpDecision(session: HostSession | undefined, run: PendingShellRun): ShellFollowUpDecision {
  if (!session) return "wait";
  const block = session.session.blocks.find((entry) => entry.id === run.commandId);
  if (!block?.shell || block.shell.running) return "wait";
  if (session.authorityGeneration !== run.authorityGeneration) return "drop";
  if (session.status === "running" || desktopOwnsTurn(session)) return "drop";
  return "send";
}

/** Watches the shell runs this composer started and sends each follow-up once. */
export function useShellFollowUp(
  session: HostSession | undefined,
  onCommand: SessionCommand,
  onError: (cause: unknown) => void,
) {
  const pending = useRef<PendingShellRun[]>([]);
  const latest = useRef({ session, onCommand, onError });
  latest.current = { session, onCommand, onError };
  const flush = useCallback(() => {
    const current = latest.current.session;
    if (!current || !pending.current.length) return;
    const still: PendingShellRun[] = [];
    let follow = false;
    for (const run of pending.current) {
      const decision = shellFollowUpDecision(current, run);
      if (decision === "wait") still.push(run);
      else if (decision === "send") follow = true;
    }
    pending.current = still;
    // Several commands finishing together are carried on by one message.
    if (follow)
      void Promise.resolve()
        .then(() => latest.current.onCommand(composerCommand(current, "send", SHELL_FOLLOW_UP_PROMPT, [])))
        .catch((cause) => latest.current.onError(cause));
  }, []);
  useEffect(flush, [session, flush]);
  // A fast command can finish before its receipt arrives, so a new run is checked at once too.
  return (run: PendingShellRun) => {
    pending.current = [...pending.current.filter((entry) => entry.commandId !== run.commandId), run];
    flush();
  };
}
