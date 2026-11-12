import { useEffect, useState } from "react";

/** How long a load may take before its placeholder appears; faster loads never flash one. */
export const LOADING_REVEAL_DELAY_MS = 250;

/** False until `delayMs` has passed since mount; a placeholder renders nothing before that. */
export function useDelayedVisible(delayMs = LOADING_REVEAL_DELAY_MS): boolean {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return visible;
}
