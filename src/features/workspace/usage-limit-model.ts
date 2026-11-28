import type { UsageLimit } from "../../../../src/features/sessions/model/session";
import { accountName, providerName } from "./provider-choices";
import type { Block, HostModelCatalog, HostSession } from "./wire";

/**
 * Where a provider usage limit stands, as desktop's UsageLimitNotice reads it:
 * - `ready`: the session moved to another account or model (`recoveryFrom`), so it can continue now;
 * - `waiting`: the reset is ahead and can be armed; `armed` once the Host will resume at the reset;
 * - `reset`: the reset time has passed; `unknown`: the provider gave no reset time.
 */
export type UsageLimitPhase = "ready" | "waiting" | "armed" | "reset" | "unknown";

export function usageLimitPhase(limit: UsageLimit, now: number): UsageLimitPhase {
  if (limit.recoveryFrom) return "ready";
  if (limit.resetsAt == null) return "unknown";
  if (limit.resetsAt <= now) return "reset";
  return limit.resumeAtReset ? "armed" : "waiting";
}

/** setTimeout's ceiling; a reset further away than this is left to a later render. */
const MAX_TIMER_MS = 2_147_483_647;

/** Delay until the reset flips the notice (0 once due), or undefined when beyond one timer. */
export function usageLimitResetDelay(limit: UsageLimit, now: number): number | undefined {
  if (limit.recoveryFrom || limit.resetsAt == null) return undefined;
  const delay = Math.max(0, limit.resetsAt - now);
  return delay > 0 && delay <= MAX_TIMER_MS ? delay : undefined;
}

/**
 * One recovery action. `resume` sends desktop's resume prompt; `arm`/`disarm`/`dismiss` are the Host
 * `usageLimit` command; `switch` opens the session's model and account sheet.
 */
export type UsageLimitAction = "resume" | "arm" | "disarm" | "switch" | "dismiss";

/**
 * The actions in order, the first being the one primary action when `primary` is set. Mirrors
 * desktop: a reset ahead can be armed (and an armed one cancelled) but not resumed; a passed or
 * unknown reset can be resumed directly; a changed target only continues. Dismiss is always offered.
 */
export function usageLimitActions(phase: UsageLimitPhase): { primary?: UsageLimitAction; secondary: UsageLimitAction[] } {
  switch (phase) {
    case "ready":
      return { primary: "resume", secondary: ["dismiss"] };
    case "waiting":
      return { primary: "arm", secondary: ["switch", "dismiss"] };
    case "armed":
      return { secondary: ["disarm", "switch", "dismiss"] };
    case "reset":
    case "unknown":
      return { primary: "resume", secondary: ["switch", "dismiss"] };
  }
}

/** The submitted user turn the limit stopped: the latest one, since any new turn clears the limit. */
export function limitedTurnModel(blocks: readonly Block[]) {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    if (block.role === "user" && !block.draft && !block.internal && !block.questionAnswers?.length)
      return block.turnModel;
  }
  return undefined;
}

/**
 * The session's limit as the notice should read it now. A Host clears the limit on an account or
 * provider change and records `recoveryFrom` on a model change; an older Host keeps the limit
 * unchanged after a model change on the same account, which would still offer to resume at the
 * reset. The limited turn's recorded model then supplies the origin, so the notice offers to
 * continue on the current model. Switching back to the limited model reads as limited again.
 */
export function currentUsageLimit(
  session: Pick<HostSession["session"], "harness" | "model" | "providerAccountId" | "usageLimit" | "blocks">,
): UsageLimit | undefined {
  const limit = session.usageLimit;
  if (!limit || limit.recoveryFrom) return limit;
  const turn = limitedTurnModel(session.blocks);
  if (!turn || (turn.harness === session.harness && turn.id === session.model)) return limit;
  return {
    ...limit,
    recoveryFrom: { harness: turn.harness, model: turn.id, providerAccountId: session.providerAccountId ?? "default" },
  };
}

/** The target that hit the limit: the retained origin after a switch, else the session's own. */
export function limitedTarget(session: Pick<HostSession["session"], "harness" | "providerAccountId" | "usageLimit">) {
  const origin = session.usageLimit?.recoveryFrom;
  return origin
    ? { provider: origin.harness, accountId: origin.providerAccountId }
    : { provider: session.harness, accountId: session.providerAccountId };
}

/**
 * "Claude · Work" when the provider lists several accounts, else the provider name alone. The
 * account's name comes from the Host catalog, the generic default login reads as `defaultLabel`.
 */
export function limitedTargetLabel(
  target: { provider: string; accountId?: string },
  accounts: HostModelCatalog["accounts"] | undefined,
  defaultLabel: string,
): string {
  const name = providerName(target.provider);
  const listed = target.provider === "claude" || target.provider === "codex" ? accounts?.[target.provider] : undefined;
  if (!listed || listed.length < 2) return name;
  const id = target.accountId ?? "default";
  const account = listed.find((entry) => entry.id === id) ?? (target.accountId ? undefined : listed.find((entry) => entry.isDefault));
  return account ? `${name} · ${accountName(account, defaultLabel)}` : name;
}
