import { useEffect, useState } from "react";

/** How long a load may take before its placeholder appears; faster loads never flash one. */
export const LOADING_REVEAL_DELAY_MS = 250;

/** Delay each active loading cycle; cached and short reads never flash a placeholder. */
export function useDelayedVisible(delayMs = LOADING_REVEAL_DELAY_MS, active = true): boolean {
  const [visible, setVisible] = useState(active && delayMs <= 0);
  // Each load owns its timer; ending a read cancels it before another read starts.
  useEffect(() => {
    setVisible(active && delayMs <= 0);
    if (!active || delayMs <= 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, active]);
  return active && visible;
}
