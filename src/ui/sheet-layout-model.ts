export type SheetPresentation = "full" | "card" | "bottom";

/** Tablets float form/compact sheets as a detached card; full sheets and phones keep their layout. */
export function sheetPresentation(tablet: boolean, full: boolean): SheetPresentation {
  return full ? "full" : tablet ? "card" : "bottom";
}

/** Card height: the share of the window it may use, never more than the free frame minus its margins. */
export function sheetCardMaxHeight(windowHeight: number, frameHeight: number, margin: number, share = 0.85): number {
  return Math.max(0, Math.min(windowHeight * share, frameHeight - margin * 2));
}
