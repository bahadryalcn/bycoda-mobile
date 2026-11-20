/** Poll pacing for the device Live view: identical frames back off, any change returns to the base rate. */
export type PacedFrame = { mime: string; base64: string; capturedAt?: string };
export type FramePace = { frame: PacedFrame; repeats: number };

export const LIVE_FRAME_BASE_MS = 3_000;
/** Longest wait on a static screen, so a change still shows within this bound. */
export const LIVE_FRAME_MAX_MS = 15_000;

/**
 * Folds the newest capture into the pace. Seeing the same capture again (an interval
 * re-evaluation, not a new poll) keeps the pace as is; a capture whose bytes equal the
 * previous one counts as a repeat; any other capture starts over.
 */
export function paceFrame(previous: FramePace | undefined, frame: PacedFrame): FramePace {
  if (!previous) return { frame, repeats: 0 };
  if (previous.frame === frame || (frame.capturedAt && previous.frame.capturedAt === frame.capturedAt))
    return previous;
  const same = previous.frame.mime === frame.mime && previous.frame.base64 === frame.base64;
  return { frame, repeats: same ? previous.repeats + 1 : 0 };
}

export function liveFrameInterval(pace: FramePace | undefined): number {
  const repeats = pace?.repeats ?? 0;
  if (repeats < 2) return LIVE_FRAME_BASE_MS;
  if (repeats < 4) return LIVE_FRAME_BASE_MS * 2;
  if (repeats < 8) return LIVE_FRAME_BASE_MS * 4;
  return LIVE_FRAME_MAX_MS;
}
