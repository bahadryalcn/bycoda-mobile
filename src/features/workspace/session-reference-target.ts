import type { TranscriptEntry } from "./transcript-model";

/** Reference turn IDs identify visible, committed user blocks, not arbitrary blocks. */
export function citedTurnEntry(entries: readonly TranscriptEntry[], turnId: string) {
  return entries.find(
    (entry) =>
      entry.kind === "message" &&
      entry.block.id === turnId &&
      entry.block.role === "user" &&
      !entry.block.internal &&
      !entry.block.draft,
  );
}
