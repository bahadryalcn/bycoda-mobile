/** A CSV file read for the table preview: bounded rows, ragged rows padded to the widest one. */
export type CsvPreview = { header: string[]; rows: string[][]; truncated: boolean; columns: number };

export const CSV_PREVIEW_MAX_ROWS = 500;
/** Text beyond this is never parsed; the preview says it is partial. */
export const CSV_PREVIEW_MAX_CHARS = 2 * 1024 * 1024;
const MAX_COLUMNS = 200;

/** RFC 4180 reader (quotes, doubled quotes, embedded newlines) that stops after the row limit. */
export function parseCsvPreview(text: string, delimiter = ","): CsvPreview {
  const limited = text.length > CSV_PREVIEW_MAX_CHARS;
  const source = limited ? text.slice(0, CSV_PREVIEW_MAX_CHARS) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let truncated = limited;
  const endRecord = () => {
    record.push(field);
    field = "";
    // A blank line is not a record.
    if (!(record.length === 1 && record[0] === "")) records.push(record);
    record = [];
  };
  for (let index = source.charCodeAt(0) === 0xfeff ? 1 : 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === delimiter) {
      if (record.length < MAX_COLUMNS) record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      endRecord();
      if (records.length > CSV_PREVIEW_MAX_ROWS) {
        truncated = true;
        break;
      }
    } else field += char;
  }
  if (records.length <= CSV_PREVIEW_MAX_ROWS && (field !== "" || record.length > 0)) endRecord();
  if (records.length > CSV_PREVIEW_MAX_ROWS + 1) {
    records.length = CSV_PREVIEW_MAX_ROWS + 1;
    truncated = true;
  }
  const columns = records.reduce((widest, row) => Math.max(widest, row.length), 0);
  const padded = records.map((row) => [...row, ...Array<string>(columns - row.length).fill("")]);
  const [header = [], ...rows] = padded;
  return { header, rows: rows.slice(0, CSV_PREVIEW_MAX_ROWS), truncated, columns };
}

/** Tab-separated files use the same reader with a tab. */
export const csvDelimiterFor = (name: string) => (/\.tsv(?:$|[?#])/i.test(name) ? "\t" : ",");
