import { createContext } from "react";

/**
 * Android Back belongs to the topmost visible sheet or dialog before any page-level handler.
 * BackHandler runs the most recently subscribed listener first, so a page handler that
 * re-subscribes while a sheet is open would otherwise run ahead of it and act on the page
 * behind the sheet. The overlay provider publishes its Back action here; page handlers yield to it.
 */
let owner: (() => void) | null = null;

export function setOverlayBackOwner(next: (() => void) | null) {
  owner = next;
}

/** Runs the visible overlay's Back (close the top sheet) and reports whether one handled it. */
export function handleOverlayBack(): boolean {
  if (!owner) return false;
  owner();
  return true;
}

/** Non-zero inside an overlay layer: that content's own Back handlers already sit above the page. */
export const OverlayLayerDepth = createContext(0);
