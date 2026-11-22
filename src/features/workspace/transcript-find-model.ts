import type { TranscriptEntry } from "./transcript-model";
import type { Block } from "./wire";

export type TranscriptFindResult = {
  blockId: string;
  entryId: string;
  index: number;
  snippet: string;
};

export type TranscriptFindSnapshot = {
  entries: readonly TranscriptEntry[];
  query: string;
  results: readonly TranscriptFindResult[];
  error?: Error;
};

/** A scan is usable only for the query and presentation that produced it. */
export function currentTranscriptFind(
  snapshot: TranscriptFindSnapshot | undefined,
  entries: readonly TranscriptEntry[],
  query: string,
  open: boolean,
) {
  return open && snapshot?.entries === entries && snapshot.query === query ? snapshot : undefined;
}

export function matchingTranscriptActivity(entries: readonly TranscriptEntry[], result: TranscriptFindResult) {
  const entry = entries.find((candidate) => candidate.id === result.entryId);
  return entry?.kind === "activity" && entry.blocks.some((block) => block.id === result.blockId) ? entry : undefined;
}

/** Only loaded display text is indexed. Never recursively scan provider/internal metadata. */
function blockText(block: Block) {
  return [
    ...new Set([
      block.text,
      block.tool?.title,
      block.tool?.detail,
      block.tool?.output,
      block.shell?.command,
      ...(block.attachments?.map((file) => file.name) ?? []),
    ]),
  ]
    .filter((text): text is string => typeof text === "string" && !!text)
    .join("\n");
}

/** Immutable completed blocks reuse normalization across query and stream updates.
 * Weak ownership lets history and inactive routes release their text normally. */
export class TranscriptFindIndex {
  private readonly text = new WeakMap<Block, { original: string; lower: string }>();

  normalized(block: Block) {
    const cached = this.text.get(block);
    if (cached) return cached;
    const original = blockText(block);
    const value = { original, lower: original.toLowerCase() };
    this.text.set(block, value);
    return value;
  }
}

/** Search yields between blocks and drops superseded queries before publishing. */
export async function findTranscriptAsync(
  entries: readonly TranscriptEntry[],
  query: string,
  options: { signal: AbortSignal; index: TranscriptFindIndex; yield?: () => Promise<void> },
): Promise<TranscriptFindResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results: TranscriptFindResult[] = [];
  const pause = options.yield ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  let deadline = Date.now() + 4;
  let scanned = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const blocks = entry.kind === "message" ? [entry.block] : entry.blocks;
    for (const block of blocks) {
      if (options.signal.aborted) return [];
      if (block.internal) continue;
      const text = options.index.normalized(block);
      const match = text.lower.indexOf(needle);
      if (match >= 0) {
        const start = Math.max(0, match - 60);
        const end = Math.min(
          text.original.length,
          Math.max(match + needle.length + 60, start + 180),
        );
        results.push({
          blockId: block.id,
          entryId: entry.id,
          index,
          snippet: `${start ? "…" : ""}${text.original.slice(start, end)}${end < text.original.length ? "…" : ""}`,
        });
      }
      if (++scanned % 256 === 0 || Date.now() >= deadline) {
        await pause();
        deadline = Date.now() + 4;
      }
    }
  }
  return options.signal.aborted ? [] : results;
}

/** One result per matching block, in chronological list order. */
export function findTranscript(
  entries: readonly TranscriptEntry[],
  query: string,
): TranscriptFindResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results: TranscriptFindResult[] = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const blocks = entry.kind === "message" ? [entry.block] : entry.blocks;
    for (const block of blocks) {
      if (block.internal) continue;
      const text = blockText(block);
      const match = text.toLowerCase().indexOf(needle);
      if (match < 0) continue;
      const start = Math.max(0, match - 60);
      const end = Math.min(text.length, Math.max(match + needle.length + 60, start + 180));
      results.push({
        blockId: block.id,
        entryId: entry.id,
        index,
        snippet: `${start ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
      });
    }
  }
  return results;
}

/** Stable block identity survives prepend, stream changes and activity regrouping. */
export function nextTranscriptResult(
  results: readonly TranscriptFindResult[],
  activeId: string | null,
  direction: 1 | -1,
) {
  if (!results.length) return undefined;
  const current = results.findIndex((result) => result.blockId === activeId);
  const next =
    current < 0
      ? direction === 1
        ? 0
        : results.length - 1
      : (current + direction + results.length) % results.length;
  return results[next];
}
