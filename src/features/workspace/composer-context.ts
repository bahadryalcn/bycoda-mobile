import type { HostSession } from "./wire";

/** Same thresholds as the desktop context meter: amber at 75%, red at 90%. */
const WARNING_PERCENT = 75;
const DANGER_PERCENT = 90;

export type ComposerContextReading = {
  /** Fraction of the window in use, or null when the harness has not reported the window. */
  ratio: number | null;
  used?: number;
  window?: number;
  costUsd?: number;
  /** Provider API time in ms, shown only when positive (desktop "API time"). */
  apiMs?: number;
  /** Average output tokens per second of the last completed turn (desktop "Response speed"). */
  tps?: number;
  /** Subagent runs with a reported context level (desktop "Subagents"). */
  agents?: ComposerContextAgent[];
  /** The conversation has no messages or usage yet: the meter shows an empty ring. */
  empty: boolean;
};

/**
 * The composer meter's reading from the synchronized session (`session.context` / `session.usage`,
 * as the desktop `ContextMeter` reads them). Null when there is nothing honest to show: no usage
 * reported for a conversation that already has messages (for example a harness that never reports).
 */
export function composerContextReading(
  session: Pick<HostSession, "session" | "history"> | undefined,
): ComposerContextReading | null {
  if (!session) return null;
  const context = session.session.context;
  const used =
    context && Number.isFinite(context.used) && context.used >= 0 ? context.used : undefined;
  const window = context?.window && context.window > 0 ? context.window : undefined;
  const usage = session.session.usage;
  const costUsd = usage && Number.isFinite(usage.costUsd) ? usage.costUsd : undefined;
  if (used === undefined) {
    const empty = !session.session.blocks.length && !session.history?.totalBlocks && !usage;
    return empty ? { ratio: 0, empty: true } : null;
  }
  const apiMs = usage && Number.isFinite(usage.apiMs) && usage.apiMs > 0 ? usage.apiMs : undefined;
  return {
    ratio: window ? Math.min(1, used / window) : null,
    used,
    window,
    costUsd,
    apiMs,
    tps: completedResponseTps(session.session.blocks),
    agents: subagentReadings(session.session.blocks),
    empty: false,
  };
}

/** Desktop `completedResponseSpeed`: the newest completed turn's output tokens over its duration. */
function completedResponseTps(blocks: HostSession["session"]["blocks"]): number | undefined {
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block?.role !== "user" || block.durationMs === undefined) continue;
    const output = block.turnMetrics?.outputTokens;
    const duration = block.durationMs;
    if (
      output === undefined ||
      !Number.isFinite(output) ||
      output < 0 ||
      !Number.isFinite(duration) ||
      duration <= 0
    )
      return undefined;
    return output / (duration / 1000);
  }
  return undefined;
}

/** Desktop `formatApiTime`: 42s, 3m 5s, 1h 2m. */
export function formatContextApiTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function contextTone(ratio: number | null): "danger" | "warning" | "normal" {
  const percent = (ratio ?? 0) * 100;
  return percent >= DANGER_PERCENT ? "danger" : percent >= WARNING_PERCENT ? "warning" : "normal";
}

/** Desktop `formatTokens`: 950, 1.2K, 176K, 1.5M. */
export function formatContextTokens(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "0";
  if (count < 1000) return String(Math.round(count));
  if (count < 1_000_000) {
    const thousands = count / 1000;
    return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : Math.round(thousands)}K`;
  }
  const millions = count / 1_000_000;
  return `${millions < 10 ? millions.toFixed(1).replace(/\.0$/, "") : Math.round(millions)}M`;
}

/** Desktop `formatCost`. */
export function formatContextCost(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}

/** "176K / 256K" or "176K" when the window is unknown. */
export function contextTokensLabel(reading: ComposerContextReading): string {
  const used = formatContextTokens(reading.used ?? 0);
  return reading.window ? `${used} / ${formatContextTokens(reading.window)}` : used;
}

export type ComposerContextAgent = {
  id: string;
  name: string;
  used?: number;
  window?: number;
  ratio: number | null;
};

/** Desktop `subagentReadings`: one entry per run, keeping the last valid level reported. */
function subagentReadings(blocks: HostSession["session"]["blocks"]): ComposerContextAgent[] {
  const agents = new Map<string, ComposerContextAgent>();
  for (const block of blocks) {
    // The transcript treats a block carrying `agentRun` as a delegated run.
    if (!block.agentRun) continue;
    const id = block.tool?.callId ?? block.id;
    const reading = block.tool?.agentContext;
    const valid = reading && Number.isFinite(reading.used) && reading.used >= 0;
    const previous = agents.get(id);
    const used = valid ? reading.used : previous?.used;
    const window = valid ? reading.window : previous?.window;
    agents.set(id, {
      id,
      name: agentName(block),
      used,
      window,
      ratio: used !== undefined && window && window > 0 ? Math.min(1, used / window) : null,
    });
  }
  return [...agents.values()];
}

/** Desktop `subagentName`: the run's name or brief, first sentence, capped on a word. */
function agentName(block: { agentRun?: { name?: string }; text?: string; tool?: { title?: string } }): string {
  const raw = (block.agentRun?.name?.trim() || (block.text || block.tool?.title || "").trim())
    .replace(/^(?:agent|task|subagent)\b[\s:·-]*/i, "")
    .trim();
  const brief = raw || "Subagent";
  const name = (brief.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? brief).trim() || brief;
  if (name.length <= 56) return name;
  const cut = name.slice(0, 56);
  const space = cut.lastIndexOf(" ");
  return `${(space > 28 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
}
