/**
 * Edit from here on a user message: offered, shown disabled with a reason, or absent. A capability the
 * computer lacks and a running turn are reasons the owner can act on, so the row stays visible and
 * says so instead of disappearing; a session the provider cannot rewind offers nothing.
 */
export type RewindAvailability = "available" | "update" | "running" | "none";

export function rewindAvailability(input: {
  /** The transcript is read-only (locked, no access, another computer's session). */
  blocked: boolean;
  /** The session's computer is the active one, whose capabilities are known. */
  sameMachine: boolean;
  capabilities?: readonly string[];
  running: boolean;
  /** The provider can rewind this conversation at its latest committed user message. */
  rewindable: boolean;
}): RewindAvailability {
  if (input.blocked || !input.sameMachine || !input.rewindable) return "none";
  if (!input.capabilities?.includes("sessions.rewind")) return "update";
  return input.running ? "running" : "available";
}
