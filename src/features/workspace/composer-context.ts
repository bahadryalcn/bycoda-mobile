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
  return {
    ratio: window ? Math.min(1, used / window) : null,
    used,
    window,
    costUsd,
    empty: false,
  };
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
