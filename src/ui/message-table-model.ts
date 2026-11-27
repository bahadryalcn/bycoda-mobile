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

/** `start` is a column without an alignment marker: it follows the text's own direction (RTL safe). */
export type TableAlign = "start" | "left" | "center" | "right";
/** One parsed Markdown table: header cells, body rows and per-column alignment. */
export type MessageTableData = {
  header: MessageNode[];
  rows: MessageNode[][];
  align: TableAlign[];
  columns: number;
};

/** In-message preview shows at most this many body rows; the full table opens in the viewer. */
export const TABLE_PREVIEW_ROWS = 8;

const cellAlign = (cell: MessageNode | undefined): TableAlign => {
  const style = cell?.attrs.style ?? "";
  return style.includes("right") ? "right" : style.includes("center") ? "center" : style.includes("left") ? "left" : "start";
};

/** React Native `textAlign` of a column; an unmarked column keeps the platform's natural alignment. */
export const tableTextAlign = (align: TableAlign | undefined) => (align && align !== "start" ? align : undefined);

// Parsed nodes are immutable and settled blocks keep their identity while a message streams, so a
// table's split (and the widths and Markdown memoized on it) is computed once, not on every render.
const tableData = new WeakMap<MessageNode, MessageTableData>();

/** Splits a parsed `table` node into header and body rows (markdown-it: thead/tbody > tr > th/td). */
export function messageTableData(table: MessageNode): MessageTableData {
  const cached = tableData.get(table);
  if (cached) return cached;
  const all = table.children.flatMap((section) => section.children).map((row) => row.children);
  const [header = [], ...rows] = all;
  const columns = all.reduce((count, row) => Math.max(count, row.length), 0);
  const data: MessageTableData = {
    header,
    rows,
    columns,
    align: Array.from({ length: columns }, (_, index) => cellAlign(header[index] ?? rows[0]?.[index])),
  };
  tableData.set(table, data);
  return data;
}

/** Rows shown inline: the first `limit` body rows, plus how many the viewer still holds. */
export function tablePreview<T>(rows: readonly T[], limit = TABLE_PREVIEW_ROWS) {
  // One hidden row is not worth a second step; show it.
  const shown = rows.length <= limit + 1 ? rows.length : limit;
  return { rows: rows.slice(0, shown), hidden: rows.length - shown };
}

// An already escaped pipe stays as written; every other pipe (also each pipe of a run such as
// `||`) is escaped so the cell stays one cell.
const markdownCell = (value: string) =>
  value.replace(/\r?\n/g, " ").replace(/\\?\|/g, (pipe) => (pipe.length === 2 ? pipe : "\\|")).trim();

/** A cell's Markdown source (emphasis, code and links kept), falling back to its plain text. */
const cellSource = (cell: MessageNode) => cell.children.find((child) => child.type === "inline")?.text ?? messageNodeText(cell);

/** GitHub-flavoured Markdown of a table's plain cell text, padded to its column count. */
export function tableMarkdown(header: readonly string[], rows: readonly (readonly string[])[], align: readonly TableAlign[] = []) {
  // A reduce, not `Math.max(...rows)`: spreading thousands of rows as arguments can overflow the stack.
  const columns = rows.reduce((count, row) => Math.max(count, row.length), Math.max(header.length, align.length, 1));
  const line = (cells: readonly string[]) =>
    `| ${Array.from({ length: columns }, (_, index) => markdownCell(cells[index] ?? "")).join(" | ")} |`;
  const rule = Array.from({ length: columns }, (_, index) =>
    align[index] === "center" ? ":---:" : align[index] === "right" ? "---:" : align[index] === "left" ? ":---" : "---",
  );
  return [line(header), `| ${rule.join(" | ")} |`, ...rows.map(line)].join("\n");
}

/** Markdown source for a parsed table, as copied from the message or the viewer. */
export function messageTableMarkdown(table: MessageTableData) {
  return tableMarkdown(
    table.header.map(cellSource),
    table.rows.map((row) => row.map(cellSource)),
    table.align,
  );
}

/** Column widths for header plus body rows of a parsed table. */
export function tableDataColumnWidths(table: MessageTableData, fontSize: number, fontScale: number): number[] {
  const widths = tableColumnWidths(
    [table.header, ...table.rows].map((cells) => cells.map((cell) => messageNodeText(cell).length)),
    fontSize,
    fontScale,
  );
  return Array.from({ length: table.columns }, (_, index) => widths[index] ?? 0);
}
