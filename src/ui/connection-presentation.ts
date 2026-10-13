export type ConnectionPhase =
  | "unpaired"
  | "offline"
  | "locked"
  | "permission"
  | "checking"
  | "connected"
  | "disconnected";
/** A saved computer is not evidence of a live connection. Recent successful RPC is. */
export function connectionPhase(input: {
  paired: boolean;
  networkConnected: boolean | null;
  unlocked: boolean;
  permitted: boolean;
  successAt: number;
  errorAt: number;
  now: number;
}): ConnectionPhase {
  if (!input.paired) return "unpaired";
  if (input.networkConnected === false) return "offline";
  if (!input.unlocked) return "locked";
  if (!input.permitted) return "permission";
  if (input.errorAt && input.errorAt >= input.successAt) return "disconnected";
  if (input.successAt > 0 && input.now - input.successAt < 45_000) return "connected";
  return "checking";
}
