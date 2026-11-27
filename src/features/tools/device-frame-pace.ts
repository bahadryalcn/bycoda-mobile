/** Poll pacing for the device Live view: identical frames and an idle viewer back off, any change returns to the base rate. */
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

/** Without a tap, key, refresh or toggle for this long, a constantly changing screen polls slower. */
export const LIVE_IDLE_MS = 60_000;
export const LIVE_IDLE_FRAME_MS = 9_000;
/** After this long without input the view polls at the static-screen maximum. */
export const LIVE_LONG_IDLE_MS = 300_000;

/** Poll interval from the screen's repeats and how long the person has not touched the view. */
export function liveFrameInterval(pace: FramePace | undefined, idleMs = 0): number {
  const repeats = pace?.repeats ?? 0;
  const paced =
    repeats < 2
      ? LIVE_FRAME_BASE_MS
      : repeats < 4
        ? LIVE_FRAME_BASE_MS * 2
        : repeats < 8
          ? LIVE_FRAME_BASE_MS * 4
          : LIVE_FRAME_MAX_MS;
  const idleFloor = idleMs >= LIVE_LONG_IDLE_MS ? LIVE_FRAME_MAX_MS : idleMs >= LIVE_IDLE_MS ? LIVE_IDLE_FRAME_MS : 0;
  return Math.max(paced, idleFloor);
}
