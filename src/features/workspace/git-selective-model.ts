import { diffLines, type ChangeObject } from "diff";
import { applyStageReplacements } from "../../../../src/features/source-control/model/selectiveStage";

export type SelectiveLine = { id: string; kind: "add" | "remove"; text: string; raw: string; line: number };
export type SelectiveHunk = { id: string; from: number; to: number; lines: SelectiveLine[] };
const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
/** Raw line endings are retained; display labels never become staged bytes. */
export function selectiveHunks(original: string, current: string, reviewedChanges?: ChangeObject<string>[]): SelectiveHunk[] {
  if (original.length > 1024 * 1024 || current.length > 1024 * 1024 || original.includes("\0") || current.includes("\0")) throw new Error("File exceeds the selective staging budget");
  const changes = reviewedChanges ?? diffLines(original, current, { timeout: 150, maxEditLength: 4000 });
  if (!changes) throw new Error("Diff exceeds the selective staging budget");
  const result: SelectiveHunk[] = []; let hunk: SelectiveHunk | undefined; let offset = 0; let oldLine = 1; let newLine = 1; let changedLines = 0;
  for (const change of changes) {
    const content = lines(change.value);
    if (!change.added && !change.removed) { offset += change.value.length; oldLine += content.length; newLine += content.length; hunk = undefined; continue; }
    if (!hunk) { hunk = { id: String(result.length), from: offset, to: offset, lines: [] }; result.push(hunk); }
    const kind = change.added ? "add" : "remove";
    for (const raw of content) {
      if (++changedLines > 4000) throw new Error("Diff exceeds the selective staging budget");
      hunk.lines.push({ id: `${hunk.id}:${hunk.lines.length}`, kind, text: raw.replace(/\r?\n$/, ""), raw, line: kind === "add" ? newLine++ : oldLine++ });
    }
    if (change.removed) { offset += change.value.length; hunk.to = offset; }
  }
  return result;
}
export function selectedStageContents(original: string, hunks: readonly SelectiveHunk[], selected: ReadonlySet<string>): string {
  const known = new Set(hunks.flatMap((hunk) => hunk.lines.map((line) => line.id)));
  if (!selected.size || [...selected].some((id) => !known.has(id))) throw new Error("Select reviewed changed lines");
  const replacements = hunks.filter((hunk) => hunk.lines.some((line) => selected.has(line.id))).map((hunk) => ({ from: hunk.from, to: hunk.to,
    insert: hunk.lines.filter((line) => line.kind === "add" ? selected.has(line.id) : !selected.has(line.id)).map((line) => line.raw).join("") }));
  return applyStageReplacements(original, replacements);
}
