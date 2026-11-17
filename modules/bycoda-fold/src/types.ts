export type FoldRect = { left: number; top: number; width: number; height: number };

/** Hinge geometry in dp, relative to the app window's top-left corner. */
export type FoldState = {
  posture: "flat" | "half-opened";
  /** Orientation of the fold line: vertical = book, horizontal = tabletop/laptop. */
  orientation: "vertical" | "horizontal";
  hingeBounds: FoldRect;
  /** True when the fold splits the window into two logical areas (content must avoid it). */
  isSeparating: boolean;
};

export type FoldNative = {
  getFoldState(): FoldState | null;
  addListener(event: "onFoldChange", listener: (event: { state: FoldState | null }) => void): { remove(): void };
};
