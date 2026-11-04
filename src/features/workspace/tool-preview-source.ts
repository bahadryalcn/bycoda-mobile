import type { Block } from "./wire";
import { sourceSlice } from "@/ui/message-code-model";
type Preview = NonNullable<NonNullable<Block["tool"]>["preview"]>;
type Kind = "add" | "del" | "context" | "output";
type Run = { start: number; end: number; kind: Kind };

/** Complete display projection, including all recorded lines and original output. */
export function toolPreviewSource(preview: Preview) {
  const parts: string[] = [], runs: Run[] = [];
  let offset = 0;
  const append = (text: string, kind: Kind) => {
    const previous = runs.at(-1);
    parts.push(text);
    if (previous?.kind === kind) previous.end += text.length;
    else runs.push({ start: offset, end: offset + text.length, kind });
    offset += text.length;
  };
  for (const [index, line] of (preview.lines ?? []).entries()) {
    append(`${index ? "\n" : ""}${line.number ?? " "} ${line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "} ${line.text}`, line.kind);
  }
  if (preview.output) append(`${offset ? "\n" : ""}${preview.output}`, "output");
  return { text: parts.join(""), runs };
}

/** Preserve diff colors across a Unicode-safe character page, including partial lines. */
export function toolPreviewPage(source: ReturnType<typeof toolPreviewSource>, start: number, end: number) {
  return source.runs.filter(run => run.end > start && run.start < end).map(run => ({
    kind: run.kind, text: sourceSlice(source.text, Math.max(start, run.start), Math.min(end, run.end)),
  })).filter(run => run.text.length > 0);
}
