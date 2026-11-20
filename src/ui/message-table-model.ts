import { messageNodeText, type MessageNode } from "./message-model";

// shortcut: glyph width is estimated as a fraction of the body em, not measured per string; upgrade to onTextLayout measurement if long words clip or columns look uneven.
const AVERAGE_GLYPH_EM = 0.55;
const MIN_COLUMN_EM = 6;
const MAX_COLUMN_EM = 16;

/**
 * Content width (dp, excluding cell padding) for each Markdown table column.
 * Widths scale with the chat body size and the system font scale, so columns grow with large text
 * while long cells stop at the maximum and wrap instead of forcing the table wider than needed.
 */
export function tableColumnWidths(cellLengths: number[][], fontSize: number, fontScale: number): number[] {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 15;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const em = size * scale;
  const columns = cellLengths.reduce((count, row) => Math.max(count, row.length), 0);
  return Array.from({ length: columns }, (_, column) => {
    const longest = cellLengths.reduce((max, row) => Math.max(max, row[column] ?? 0), 0);
    return Math.min(MAX_COLUMN_EM * em, Math.max(MIN_COLUMN_EM * em, longest * AVERAGE_GLYPH_EM * em));
  });
}

/** Sizes the columns of parsed table rows (each row's children are its cells) by their plain text. */
export function messageTableColumnWidths(rows: MessageNode[], fontSize: number, fontScale: number): number[] {
  return tableColumnWidths(
    rows.map((row) => row.children.map((cell) => messageNodeText(cell).length)),
    fontSize,
    fontScale,
  );
}
