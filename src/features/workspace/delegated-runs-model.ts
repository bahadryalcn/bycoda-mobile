import type { Block } from "@/domain/types";
import type { ChildSessionEntry } from "./subagent-sessions-model";

/**
 * bycoda-delegated runs in the transcript, ported from desktop `delegatedCards` (its module is not a
 * pure mobile import). An `agents.delegate` call that names a listed child session becomes that
 * child's subagent row, and `agents.wait`/`agents.reply` calls whose runs are all listed children
 * leave the transcript: the child's row shows their state. Anything unreadable keeps its tool row.
 */

export type DelegationToolKind = "delegate" | "wait" | "reply" | "consult";

/** Which `agents.*` call a tool block is, from its title, preview title or text. */
export function delegationToolKind(block: Pick<Block, "role" | "text" | "tool">): DelegationToolKind | undefined {
  if (block.role !== "tool") return undefined;
  for (const value of [block.tool?.title, block.tool?.preview?.title, block.text]) {
    const kind = value?.trim().match(/(?:^|[:_.])agents[_.](delegate|wait|reply|consult)$/i)?.[1]?.toLowerCase();
    if (kind === "delegate" || kind === "wait" || kind === "reply" || kind === "consult") return kind;
  }
  return undefined;
}

export type DelegateCall = { kind: "delegate" | "wait" | "reply"; sessionIds: string[] };

const calls = new WeakMap<Block, DelegateCall | null>();

/**
 * The child sessions a delegate, wait or reply call names in its JSON result (`{sessionId}` or
 * `{runs: [{sessionId}]}`); undefined for any other block. A missing or truncated result names none.
 */
export function delegateCall(block: Block): DelegateCall | undefined {
  if (block.role !== "tool") return undefined;
  const cached = calls.get(block);
  if (cached !== undefined) return cached ?? undefined;
  const kind = delegationToolKind(block);
  let call: DelegateCall | null = null;
  if (kind === "delegate" || kind === "wait" || kind === "reply") {
    const sessionIds: string[] = [];
    try {
      const detail: unknown = JSON.parse(block.tool?.detail ?? "");
      const runs = (detail as { runs?: unknown } | null)?.runs;
      for (const run of Array.isArray(runs) ? runs : [detail]) {
        const id = (run as { sessionId?: unknown } | null)?.sessionId;
        if (typeof id === "string" && id && !sessionIds.includes(id)) sessionIds.push(id);
      }
    } catch {
      // A call without a readable result names no child; it stays a plain row.
    }
    call = { kind, sessionIds };
  }
  calls.set(block, call);
  return call ?? undefined;
}

const DELEGATED = "delegated:";
const runStatus = (state: ChildSessionEntry["state"]) =>
  state === "running" || state === "queued" ? "running" : state === "completed" ? "completed" : state === "failed" ? "failed" : "stopped";

const runBlocks = new WeakMap<Block, { key: string; block: Block }>();

/**
 * The child's row block in place of the call that started it. Its `delegated:<id>` id makes the
 * row take the child's state and open the child; the call's JSON result is not its report.
 * One block per call and child shape, so an unchanged frame keeps the row's identity.
 */
export function delegatedRunBlock(call: Block, child: ChildSessionEntry): Block {
  const key = JSON.stringify([child.sessionId, child.title, child.state, child.model, child.startedAt, child.endedAt]);
  const cached = runBlocks.get(call);
  if (cached?.key === key) return cached.block;
  const block: Block = {
    id: `${DELEGATED}${child.sessionId}`,
    role: "tool",
    text: child.title,
    ...(call.startedAt !== undefined ? { startedAt: call.startedAt } : {}),
    tool: { ...(call.tool?.callId ? { callId: call.tool.callId } : {}), title: child.title, status: runStatus(child.state) },
    agentRun: {
      name: child.title,
      steps: [],
      ...(child.model ? { model: child.model } : {}),
      startedAt: child.startedAt,
      ...(child.endedAt !== undefined ? { endedAt: child.endedAt } : {}),
    },
  };
  runBlocks.set(call, { key, block });
  return block;
}

/**
 * `blocks` with each listed child's delegate call replaced by its row block, and wait/reply calls
 * whose runs are all listed children dropped. A child that already has a `delegated:` block, or an
 * earlier call, keeps that one. Returns `blocks` itself when nothing changes.
 */
export function placeDelegatedRuns(blocks: Block[], children: readonly ChildSessionEntry[]): Block[] {
  if (!children.length) return blocks;
  const byId = new Map(children.map((child) => [child.sessionId, child]));
  const placed = new Set<string>();
  for (const block of blocks) if (block.id.startsWith(DELEGATED)) placed.add(block.id.slice(DELEGATED.length));
  let changed = false;
  const next: Block[] = [];
  for (const block of blocks) {
    const call = delegateCall(block);
    if (call?.kind === "delegate") {
      const id = call.sessionIds[0];
      const child = id ? byId.get(id) : undefined;
      if (child && !placed.has(child.sessionId)) {
        placed.add(child.sessionId);
        next.push(delegatedRunBlock(block, child));
        changed = true;
        continue;
      }
    } else if (call && call.sessionIds.length && call.sessionIds.every((id) => byId.has(id))) {
      changed = true;
      continue;
    }
    next.push(block);
  }
  return changed ? next : blocks;
}
