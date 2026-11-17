import { metrics } from "./tokens";

/** Centered readable column for wide panes; apply to a wrapper or a scroller's content container. */
export const readableColumn = {
  width: "100%",
  maxWidth: metrics.readableWidth,
  alignSelf: "center",
} as const;

/** The same column for a single-column tab root; phones pass through at full width. */
export function tabRootColumn(tablet: boolean) {
  return tablet ? ({ flex: 1, ...readableColumn } as const) : ({ flex: 1 } as const);
}
